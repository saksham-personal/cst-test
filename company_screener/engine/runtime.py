"""Shared index-backed runtime for Company Screener.

This module is intentionally Streamlit-free so both the web app and backend
service can import the same query engine.
"""

from __future__ import annotations

import json
import os
import sqlite3
from functools import lru_cache
from pathlib import Path

import pandas as pd

from .highlighter import (
    _build_highlight_pattern,
    _build_keyword_highlight_pattern,
    _extract_snippet,
    _highlight_text_fast,
)
from .keyword_utils import (
    _build_exact_text_pattern,
    _build_fts_term,
    _build_keyword_query_spec,
    _clean_fts_keyword,
    _exact_keyword_requires_raw_fallback,
    _is_exact_keyword,
    _keyword_has_searchable_text,
)
from .parser import (
    build_keyword_serial_map,
    collect_positive_numbers,
    collect_serial_numbers,
    evaluate_expression,
)
from .utils import (
    _normalize_text_value,
    _normalize_url,
    _safe_threadpool_map,
    _unique_preserve_order,
)


ENGINE_CACHE_VERSION = "2026-04-12-1"


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_index_dir() -> str:
    repo_root = _default_repo_root()
    exact = repo_root / "search_index_exact"
    if exact.exists():
        return str(exact)
    return str(repo_root / "search_index")


def _safe_mtime(path: str | os.PathLike[str]) -> float | None:
    try:
        return os.path.getmtime(path)
    except OSError:
        return None


def _index_bundle_signature(index_dir: str) -> tuple:
    index_dir = os.path.abspath(index_dir)
    return (
        ENGINE_CACHE_VERSION,
        index_dir,
        _safe_mtime(os.path.join(index_dir, "index_config.json")),
        _safe_mtime(os.path.join(index_dir, "company_metadata.parquet")),
        _safe_mtime(os.path.join(index_dir, "search.db")),
        _safe_mtime(os.path.abspath(__file__)),
    )


def _default_scoring_config_path() -> str:
    return str(_default_repo_root() / "scoring_config.json")


@lru_cache(maxsize=8)
def _load_json_file(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_scoring_config(scoring_config_path: str | None = None) -> dict:
    return _load_json_file(scoring_config_path or _default_scoring_config_path())


@lru_cache(maxsize=8)
def _load_config_cached(index_dir: str, index_signature: tuple) -> dict:
    config_path = os.path.join(index_dir, "index_config.json")
    return _load_json_file(config_path)


def load_config(index_signature=None, index_dir: str | None = None) -> dict:
    index_dir = os.path.abspath(index_dir or _default_index_dir())
    signature = tuple(index_signature) if index_signature is not None else ()
    return _load_config_cached(index_dir, signature)


@lru_cache(maxsize=8)
def _load_metadata_cached(index_dir: str, index_signature: tuple) -> pd.DataFrame:
    parquet_path = os.path.join(index_dir, "company_metadata.parquet")
    df = pd.read_parquet(parquet_path)
    config = load_config(index_signature=index_signature, index_dir=index_dir)
    primary_key = config["primary_key"]
    if primary_key in df.columns:
        df[primary_key] = df[primary_key].astype(str).str.strip()
    return df


def load_metadata(index_signature=None, index_dir: str | None = None) -> pd.DataFrame:
    index_dir = os.path.abspath(index_dir or _default_index_dir())
    signature = tuple(index_signature) if index_signature is not None else ()
    return _load_metadata_cached(index_dir, signature)


def get_db_connection(index_dir: str | None = None, scoring_ext_path: str | None = None):
    """Create a SQLite connection and load the optional C extension if present."""
    db_path = os.path.join(os.path.abspath(index_dir or _default_index_dir()), "search.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    ext_path = scoring_ext_path or str(_default_repo_root() / "scoring_ext")
    if os.path.exists(ext_path):
        try:
            conn.enable_load_extension(True)
            conn.load_extension(ext_path)
        except Exception:
            pass
        finally:
            try:
                conn.enable_load_extension(False)
            except Exception:
                pass
    return conn


def get_db_connection_light(index_dir: str | None = None):
    """Create a SQLite connection without loading the optional extension."""
    db_path = os.path.join(os.path.abspath(index_dir or _default_index_dir()), "search.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def merge_results_with_metadata(results, metadata: pd.DataFrame, primary_key: str) -> pd.DataFrame:
    """Vectorized metadata merge helper for backend and UI consumers."""
    df = pd.DataFrame(results)
    if df.empty:
        return df

    if primary_key not in df.columns and "primary_key_value" in df.columns:
        df = df.copy()
        df[primary_key] = df["primary_key_value"]

    meta_deduped = metadata.drop_duplicates(subset=[primary_key])
    return df.merge(meta_deduped, on=primary_key, how="left")


class SearchEngine:
    """Company-level lexical search runtime backed by SQLite FTS5."""

    def __init__(self, index_signature=None, index_dir: str | None = None):
        self.index_dir = os.path.abspath(index_dir or _default_index_dir())
        self.index_signature = tuple(index_signature) if index_signature is not None else _index_bundle_signature(self.index_dir)

        self.config = load_config(self.index_signature, self.index_dir)
        self.scoring_config = load_scoring_config()
        self.metadata = load_metadata(self.index_signature, self.index_dir)
        self.primary_key = self.config["primary_key"]
        self.company_name_col = self.config.get("company_name_col", "Company")
        self.fts_table_name = self.config.get("fts_table_name", "company_fts")
        self.exact_fts_table_name = self.config.get("exact_fts_table_name", "company_exact_fts")
        self.column_weight_args = ", ".join(
            str(weight) for weight in self.scoring_config.get("source_weights", [])
        )
        self.source_columns = list(self.scoring_config.get("source_columns", []))
        self.exact_fts_available = False

        conn = get_db_connection_light(self.index_dir)
        try:
            table_names = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
                ).fetchall()
            }
            self.exact_fts_available = self.exact_fts_table_name in table_names
            map_cols = {r["name"] for r in conn.execute("PRAGMA table_info(company_map)").fetchall()}
            map_value_col = None
            for candidate in ("primary_key_value", self.primary_key, "company_name", "crescendo_id"):
                if candidate in map_cols:
                    map_value_col = candidate
                    break
            if map_value_col is None:
                raise RuntimeError(
                    "company_map is missing a usable primary-key column. Rebuild the index with the current build_index.py."
                )
            rows = conn.execute(
                f"SELECT id, {map_value_col} AS primary_key_value FROM company_map ORDER BY id"
            ).fetchall()
        finally:
            conn.close()

        self.rowid_map = {}
        for row in rows:
            normalized = _normalize_text_value(row["primary_key_value"])
            if normalized:
                self.rowid_map[row["id"]] = normalized

        self.key_to_rowid = {v: k for k, v in self.rowid_map.items()}
        self.all_primary_keys = frozenset(self.rowid_map.values())

        self.meta_deduped = self.metadata.drop_duplicates(subset=[self.primary_key])
        self.meta_indexed = self.meta_deduped.set_index(self.primary_key)
        self._exact_search_frame = None

    def get_capabilities(self) -> dict:
        return {
            "index_dir": self.index_dir,
            "primary_key": self.primary_key,
            "company_name_col": self.company_name_col,
            "fts_table_name": self.fts_table_name,
            "exact_fts_table_name": self.exact_fts_table_name,
            "exact_fts_available": self.exact_fts_available,
            "supports_exact_quotes": True,
            "supports_raw_exact_fallback": True,
            "supports_expression_queries": True,
            "scoring_mode": "bm25",
            "source_columns": self.source_columns,
            "num_companies": len(self.rowid_map),
        }

    def capabilities(self) -> dict:
        return self.get_capabilities()

    def _get_exact_search_frame(self) -> pd.DataFrame:
        if self._exact_search_frame is None:
            exact_frame = self.meta_indexed.reindex(columns=self.source_columns, fill_value="").copy()
            for col in exact_frame.columns:
                exact_frame[col] = exact_frame[col].fillna("").astype(str)
            self._exact_search_frame = exact_frame
        return self._exact_search_frame

    def _search_exact_keyword_ids_fallback(self, keyword):
        pattern = _build_exact_text_pattern(keyword)
        if pattern is None:
            return set()

        exact_frame = self._get_exact_search_frame()
        if exact_frame.empty:
            return set()

        match_mask = pd.Series(False, index=exact_frame.index, dtype=bool)
        for col in exact_frame.columns:
            match_mask |= exact_frame[col].str.contains(pattern, na=False)
        return set(exact_frame.index[match_mask])

    def get_company_name(self, primary_key_value):
        key_value = _normalize_text_value(primary_key_value)
        if not key_value:
            return ""
        if self.primary_key == self.company_name_col:
            return key_value
        if self.company_name_col not in self.meta_indexed.columns:
            return key_value
        try:
            company_name = self.meta_indexed.at[key_value, self.company_name_col]
        except (KeyError, TypeError):
            return key_value
        if isinstance(company_name, pd.Series):
            company_name = company_name.iloc[0]
        return _normalize_text_value(company_name) or key_value

    def _resolve_keyword_query_spec(self, keyword):
        spec = _build_keyword_query_spec(keyword)
        if not spec["term"]:
            return None
        if spec["table"] == "exact":
            table_name = self.exact_fts_table_name
            if not self.exact_fts_available or _exact_keyword_requires_raw_fallback(keyword):
                table_name = None
        else:
            table_name = self.fts_table_name
        return {**spec, "table_name": table_name}

    def _execute_keyword_query(self, keyword, *, with_rank=False):
        spec = self._resolve_keyword_query_spec(keyword)
        if spec is None or spec["table_name"] is None:
            return []

        conn = get_db_connection_light(self.index_dir)
        try:
            if with_rank:
                sql = f"""
                    SELECT rowid, bm25({spec['table_name']}, {self.column_weight_args}) AS rank
                    FROM {spec['table_name']}
                    WHERE {spec['table_name']} MATCH ?
                """
            else:
                sql = f"""
                    SELECT rowid
                    FROM {spec['table_name']}
                    WHERE {spec['table_name']} MATCH ?
                """
            return conn.execute(sql, (spec["term"],)).fetchall()
        finally:
            conn.close()

    def count_keyword_hits(self, keyword):
        spec = self._resolve_keyword_query_spec(keyword)
        if spec is None:
            return 0
        if spec["table"] == "exact" and spec["table_name"] is None:
            return len(self._search_exact_keyword_ids_fallback(keyword))

        conn = get_db_connection_light(self.index_dir)
        try:
            row = conn.execute(
                f"SELECT COUNT(*) as cnt FROM {spec['table_name']} WHERE {spec['table_name']} MATCH ?",
                (spec["term"],),
            ).fetchone()
            return row["cnt"] if row else 0
        except Exception:
            return 0
        finally:
            conn.close()

    def _search_with_scoring_mixed(self, include_kws, excluded_cids=None, limit=None):
        if excluded_cids is None:
            excluded_cids = set()
        if limit is not None and limit <= 0:
            return [], {}

        rowid_map_local = self.rowid_map
        total_kw_weight = sum(float(kw.get("weight", 1)) for kw in include_kws)
        keyword_weight_by_serial = {}
        results_by_primary_key = {}

        for idx, kw_cfg in enumerate(include_kws, start=1):
            try:
                serial = int(kw_cfg.get("serial", idx))
            except (TypeError, ValueError):
                serial = idx
            keyword_weight_by_serial[serial] = float(kw_cfg.get("weight", 1))

            spec = self._resolve_keyword_query_spec(kw_cfg["keyword"])
            if spec is None:
                continue

            if spec["table"] == "exact" and spec["table_name"] is None:
                matched_primary_keys = self._search_exact_keyword_ids_fallback(kw_cfg["keyword"])
                for primary_key_value in matched_primary_keys:
                    if primary_key_value in excluded_cids:
                        continue

                    info = results_by_primary_key.setdefault(
                        primary_key_value,
                        {
                            "primary_key_value": primary_key_value,
                            "rowid": self.key_to_rowid.get(primary_key_value),
                            "relevance": 0.0,
                            "composite_score": 0.0,
                            "matched_keywords": [],
                            "matched_serials": [],
                            "matches": [],
                        },
                    )
                    info["matched_keywords"].append(kw_cfg["keyword"])
                    info["matched_serials"].append(serial)
                continue

            score_rows = self._execute_keyword_query(kw_cfg["keyword"], with_rank=True)
            for row in score_rows:
                rid = row["rowid"]
                primary_key_value = rowid_map_local.get(rid)
                if not primary_key_value or primary_key_value in excluded_cids:
                    continue

                info = results_by_primary_key.setdefault(
                    primary_key_value,
                    {
                        "primary_key_value": primary_key_value,
                        "rowid": self.key_to_rowid.get(primary_key_value, rid),
                        "relevance": 0.0,
                        "composite_score": 0.0,
                        "matched_keywords": [],
                        "matched_serials": [],
                        "matches": [],
                    },
                )
                relevance = -(row["rank"] or 0.0)
                info["relevance"] += relevance
                info["composite_score"] = info["relevance"]
                info["matched_keywords"].append(kw_cfg["keyword"])
                info["matched_serials"].append(serial)

        results = []
        for info in results_by_primary_key.values():
            info["matched_keywords"] = _unique_preserve_order(info.get("matched_keywords", []))
            info["matched_serials"] = _unique_preserve_order(info.get("matched_serials", []))
            matched_weight = sum(
                keyword_weight_by_serial.get(serial, 0.0)
                for serial in info["matched_serials"]
            )
            info["completeness"] = matched_weight / total_kw_weight if total_kw_weight > 0 else 0.0
            info["n_keywords"] = len(include_kws)
            info["keywords_matched"] = len(info["matched_keywords"])
            results.append(info)

        results.sort(key=lambda x: -x["composite_score"])
        if limit is not None:
            results = results[:limit]
        return results, {}

    def search_with_scoring(self, keywords_config, excluded_cids=None, limit=None):
        if excluded_cids is None:
            excluded_cids = set()

        include_kws = [
            k for k in keywords_config
            if k["action"] == "include" and _keyword_has_searchable_text(k.get("keyword"))
        ]
        if not include_kws:
            return [], {}

        if any(_is_exact_keyword(kw.get("keyword")) for kw in include_kws):
            return self._search_with_scoring_mixed(include_kws, excluded_cids, limit=limit)

        if limit is not None and limit <= 0:
            return [], {}

        fts_terms = []
        kw_weights = []
        for kw in include_kws:
            term = _build_fts_term(kw["keyword"])
            if term:
                fts_terms.append(term)
                kw_weights.append(float(kw.get("weight", 1)))

        if not fts_terms:
            return [], {}

        fts_query = " OR ".join(fts_terms)
        conn = get_db_connection_light(self.index_dir)
        try:
            sql = f"""
                SELECT rowid, bm25({self.fts_table_name}, {self.column_weight_args}) as rank
                FROM {self.fts_table_name}
                WHERE {self.fts_table_name} MATCH ?
                ORDER BY rank
            """
            params = [fts_query]
            if limit is not None:
                sql += "\nLIMIT ?"
                params.append(limit)
            rows = conn.execute(sql, params).fetchall()

            rowid_map_local = self.rowid_map
            total_kw_weight = sum(kw_weights)
            results = []
            result_primary_keys = set()

            for r in rows:
                rid = r["rowid"]
                primary_key_value = rowid_map_local.get(rid)
                if not primary_key_value or primary_key_value in excluded_cids:
                    continue

                relevance = -(r["rank"] or 0.0)
                results.append(
                    {
                        "primary_key_value": primary_key_value,
                        "rowid": rid,
                        "relevance": relevance,
                        "composite_score": relevance,
                    }
                )
                result_primary_keys.add(primary_key_value)

            kw_match_info = {}
            keyword_weight_by_serial = {}
            for idx, kw_cfg in enumerate(include_kws, start=1):
                try:
                    serial = int(kw_cfg.get("serial", idx))
                except (TypeError, ValueError):
                    serial = idx
                keyword_weight_by_serial[serial] = float(kw_cfg.get("weight", 1))

            if result_primary_keys:

                def _match_one_keyword(kw_cfg):
                    try:
                        kw_rows = self._execute_keyword_query(kw_cfg["keyword"], with_rank=False)
                    except Exception:
                        return kw_cfg["keyword"], int(kw_cfg.get("serial", 0)), set()

                    matched_ids = {
                        rowid_map_local[row["rowid"]]
                        for row in kw_rows
                        if row["rowid"] in rowid_map_local
                        and rowid_map_local[row["rowid"]] in result_primary_keys
                    }
                    return kw_cfg["keyword"], int(kw_cfg.get("serial", 0)), matched_ids

                keyword_matches = _safe_threadpool_map(include_kws, _match_one_keyword, max_workers=8)
                for keyword_text, serial, matched_ids in keyword_matches:
                    for primary_key_value in matched_ids:
                        info = kw_match_info.setdefault(
                            primary_key_value,
                            {"keywords": [], "serials": []},
                        )
                        info["keywords"].append(keyword_text)
                        if serial:
                            info["serials"].append(serial)

            for r in results:
                info = kw_match_info.get(r["primary_key_value"], {})
                r["matched_keywords"] = _unique_preserve_order(info.get("keywords", []))
                r["matched_serials"] = _unique_preserve_order(info.get("serials", []))
                matched_weight = sum(
                    keyword_weight_by_serial.get(serial, 0.0)
                    for serial in r["matched_serials"]
                )
                r["completeness"] = matched_weight / total_kw_weight if total_kw_weight > 0 else 0.0
                r["n_keywords"] = len(include_kws)
                r["keywords_matched"] = len(r["matched_keywords"])
                r["matches"] = []

            return results, {}
        finally:
            conn.close()

    def attach_highlights(self, results, keywords_config, max_results=50):
        include_kws = [
            k for k in keywords_config
            if k["action"] == "include" and _keyword_has_searchable_text(k.get("keyword"))
        ]
        if not include_kws:
            return

        top_results = results[:max_results]
        if not top_results:
            return

        conn = get_db_connection_light(self.index_dir)
        try:
            self._attach_highlights(conn, top_results, include_kws, {})
        finally:
            conn.close()

    def _attach_highlights(self, conn, results, include_kws, rowid_map):
        scoring_cfg = self.scoring_config
        source_columns = scoring_cfg["source_columns"]
        fts5_columns = scoring_cfg["fts5_column_names"]

        rowid_to_idx = {}
        for i, r in enumerate(results):
            rowid_to_idx[r["rowid"]] = i
            r["matches"] = []

        if not rowid_to_idx:
            return

        placeholders = ",".join(["?"] * len(rowid_to_idx))
        col_list = ", ".join(fts5_columns)
        raw_rows = conn.execute(
            f"SELECT rowid, {col_list} FROM company_fts "
            f"WHERE rowid IN ({placeholders})",
            list(rowid_to_idx.keys()),
        ).fetchall()

        raw_by_rowid = {}
        for r in raw_rows:
            raw_by_rowid[r["rowid"]] = {col: r[col] for col in fts5_columns}

        exact_keywords_present = any(_is_exact_keyword(kw.get("keyword")) for kw in include_kws)
        pattern = None
        if not exact_keywords_present:
            all_kw_texts = [
                kw["keyword"] for kw in include_kws
                if _keyword_has_searchable_text(kw.get("keyword"))
            ]
            pattern = _build_highlight_pattern(all_kw_texts)
            if not pattern:
                return

        per_kw_patterns = {}
        for kw_cfg in include_kws:
            keyword = kw_cfg["keyword"]
            if _keyword_has_searchable_text(keyword):
                p = _build_keyword_highlight_pattern(keyword)
                if p:
                    per_kw_patterns[keyword] = p
        if not per_kw_patterns:
            return

        def _highlight_one(rowid):
            raw = raw_by_rowid.get(rowid)
            if raw is None:
                return []
            matches = []
            for fts_col, src_col in zip(fts5_columns, source_columns):
                text = raw[fts_col]
                if not text or not text.strip():
                    continue
                if pattern is not None:
                    highlighted = _highlight_text_fast(text, pattern)
                    if "<mark>" not in highlighted:
                        continue
                for keyword, kw_pat in per_kw_patterns.items():
                    kw_highlighted = _highlight_text_fast(text, kw_pat)
                    if "<mark>" not in kw_highlighted:
                        continue
                    snippet = _extract_snippet(kw_highlighted)
                    if snippet:
                        matches.append(
                            {
                                "source": src_col,
                                "keyword": keyword,
                                "match_type": "lexical",
                                "sentence": snippet,
                                "context_before": "",
                                "context_after": "",
                            }
                        )
            return matches

        n_workers = min(8, len(rowid_to_idx))
        if n_workers <= 1:
            for rowid, idx in rowid_to_idx.items():
                results[idx]["matches"] = _highlight_one(rowid)
        else:
            from concurrent.futures import ThreadPoolExecutor, as_completed

            with ThreadPoolExecutor(max_workers=n_workers) as pool:
                future_to_rowid = {pool.submit(_highlight_one, rid): rid for rid in rowid_to_idx}
                for fut in as_completed(future_to_rowid):
                    rid = future_to_rowid[fut]
                    idx = rowid_to_idx[rid]
                    results[idx]["matches"] = fut.result()

    def search_keyword_for_exclusion(self, keyword):
        spec = self._resolve_keyword_query_spec(keyword)
        if spec is None:
            return set()
        if spec["table"] == "exact" and spec["table_name"] is None:
            return self._search_exact_keyword_ids_fallback(keyword)

        rows = self._execute_keyword_query(keyword, with_rank=False)
        try:
            return {
                self.rowid_map[r["rowid"]]
                for r in rows
                if r["rowid"] in self.rowid_map
            }
        except Exception:
            return set()

    def search_single_keyword_ids(self, keyword):
        return self.search_keyword_for_exclusion(keyword)

    def execute_query(self, keywords_config):
        include_keywords = [k for k in keywords_config if k["action"] == "include"]
        exclude_keywords = [k for k in keywords_config if k["action"] == "exclude"]

        if not include_keywords:
            return [], {}

        excluded_cids = set()
        active_excludes = [k for k in exclude_keywords if _keyword_has_searchable_text(k.get("keyword"))]
        if active_excludes:
            exclude_sets = _safe_threadpool_map(
                [k["keyword"] for k in active_excludes],
                self.search_keyword_for_exclusion,
                max_workers=8,
            )
            for matched_ids in exclude_sets:
                excluded_cids.update(matched_ids)

        results, kw_hit_counts = self.search_with_scoring(keywords_config, excluded_cids)

        results.sort(key=lambda x: (-x["completeness"], -x["composite_score"]))
        return results, kw_hit_counts

    def execute_expression_query(self, keywords_config, ast):
        serial_numbers = collect_serial_numbers(ast)
        if not serial_numbers:
            return [], {}

        serial_map = build_keyword_serial_map(keywords_config)
        keyword_result_sets = {}

        def _lookup_ids(sn):
            kw_cfg = serial_map.get(sn)
            if kw_cfg is None:
                return sn, set()
            keyword = kw_cfg["keyword"]
            if _keyword_has_searchable_text(keyword):
                return sn, self.search_single_keyword_ids(keyword)
            return sn, set()

        for key, ids in _safe_threadpool_map(sorted(serial_numbers), _lookup_ids, max_workers=8):
            keyword_result_sets[key] = ids

        all_company_ids = self.all_primary_keys
        result_cids = evaluate_expression(ast, keyword_result_sets, all_company_ids)

        if not result_cids:
            return [], {}

        positive_numbers = collect_positive_numbers(ast)
        scoring_kws = []
        for sn in sorted(positive_numbers):
            kw_cfg = serial_map.get(sn)
            if kw_cfg is None:
                continue
            scoring_kws.append(
                {
                    "serial": sn,
                    "keyword": kw_cfg["keyword"],
                    "mode": "lexical",
                    "action": "include",
                    "weight": kw_cfg.get("weight", 1),
                }
            )

        positive_union = set()
        for sn in positive_numbers:
            positive_union.update(keyword_result_sets.get(sn, set()))

        if not scoring_kws:
            ordered_result_cids = [
                primary_key_value
                for primary_key_value in self.rowid_map.values()
                if primary_key_value in result_cids
            ]
            return [
                {
                    "primary_key_value": cid,
                    "rowid": self.key_to_rowid.get(cid),
                    "completeness": 1.0,
                    "relevance": 0.0,
                    "composite_score": 0.0,
                    "keywords_matched": 0,
                    "n_keywords": 0,
                    "matched_keywords": [],
                    "matched_serials": [],
                    "matches": [],
                }
                for cid in ordered_result_cids
            ], {}

        score_limit = len(positive_union) if positive_union else len(self.rowid_map)
        all_results, kw_hit_counts = self.search_with_scoring(
            scoring_kws,
            limit=score_limit,
        )

        filtered = [r for r in all_results if r["primary_key_value"] in result_cids]

        scored_cids = {r["primary_key_value"] for r in filtered}
        for cid in result_cids - scored_cids:
            filtered.append(
                {
                    "primary_key_value": cid,
                    "completeness": 0.0,
                    "relevance": 0.0,
                    "composite_score": 0.0,
                    "keywords_matched": 0,
                    "n_keywords": len(scoring_kws),
                    "matched_keywords": [],
                    "matched_serials": [],
                    "matches": [],
                }
            )

        filtered.sort(key=lambda x: -x["composite_score"])
        return filtered, kw_hit_counts

    def merge_results_with_metadata(self, results) -> pd.DataFrame:
        return merge_results_with_metadata(results, self.metadata, self.primary_key)

