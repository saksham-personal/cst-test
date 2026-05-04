from __future__ import annotations

import logging
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

import pandas as pd

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.schemas.search import KeywordInput, SearchExecuteRequest, SearchPageResponse
from app.services.history import HistoryService
from company_screener.engine import (
    SearchEngine,
    _keyword_has_searchable_text,
    _safe_threadpool_map,
    humanize_expression,
    parse_expression,
    validate_expression,
)


logging.getLogger("streamlit.runtime.caching.cache_data_api").setLevel(logging.ERROR)
logging.getLogger("streamlit.runtime.caching.cache_resource_api").setLevel(logging.ERROR)


@dataclass(slots=True)
class SearchRecord:
    search_id: str
    keywords: list[dict[str, Any]]
    query_expression: str
    search_mode: str
    parsed_query: str
    results: list[dict[str, Any]]
    keyword_hit_counts: dict[str, int]
    timings_ms: dict[str, float]
    created_at: float


class SearchCache:
    def __init__(self, max_entries: int, ttl_seconds: int) -> None:
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._items: OrderedDict[str, SearchRecord] = OrderedDict()
        self._lock = Lock()

    def _purge_locked(self) -> None:
        now = time.time()
        expired = [key for key, value in self._items.items() if now - value.created_at > self.ttl_seconds]
        for key in expired:
            self._items.pop(key, None)
        while len(self._items) > self.max_entries:
            self._items.popitem(last=False)

    def put(self, record: SearchRecord) -> None:
        with self._lock:
            self._items[record.search_id] = record
            self._items.move_to_end(record.search_id)
            self._purge_locked()

    def get(self, search_id: str) -> SearchRecord | None:
        with self._lock:
            self._purge_locked()
            record = self._items.get(search_id)
            if record is not None:
                self._items.move_to_end(search_id)
            return record


class SearchService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.index_dir = Path(settings.index_dir)
        self.repo_root = self.index_dir.parent
        self.cache = SearchCache(
            max_entries=settings.search_cache_max_entries,
            ttl_seconds=settings.search_cache_ttl_seconds,
        )
        self._history = HistoryService(settings)
        self._engine: SearchEngine | None = None
        self._engine_load_error: str | None = None
        self.primary_key = ""
        self.company_name_col = ""
        self.fts_table_name = ""
        self.exact_fts_table_name = ""
        config_file = self.index_dir / "index_config.json"
        if config_file.exists():
            self._load_engine_if_available(self.index_dir)

    def _reset_engine_state(self) -> None:
        self._engine = None
        self.primary_key = ""
        self.company_name_col = ""
        self.fts_table_name = ""
        self.exact_fts_table_name = ""

    def _apply_engine(self, engine: SearchEngine) -> None:
        self._engine = engine
        self._engine_load_error = None
        self.primary_key = engine.primary_key
        self.company_name_col = engine.company_name_col
        self.fts_table_name = engine.fts_table_name
        self.exact_fts_table_name = engine.exact_fts_table_name

    def _load_engine_if_available(self, index_dir: Path) -> bool:
        try:
            engine = SearchEngine(index_dir=str(index_dir))
        except Exception as exc:
            logging.getLogger(__name__).exception("Failed to load search index from %s", index_dir)
            self._reset_engine_state()
            self._engine_load_error = str(exc)
            return False
        self._apply_engine(engine)
        return True

    @property
    def engine(self) -> SearchEngine:
        if self._engine is None:
            details = {"index_dir": str(self.index_dir)}
            if self._engine_load_error:
                details["load_error"] = self._engine_load_error
                raise ValidationAppError(
                    "Search index could not be loaded. Rebuild or reactivate the bundle via "
                    "the Build Index page before searching.",
                    details=details,
                )
            raise ValidationAppError(
                "No search index loaded. Build or activate an index bundle via "
                "the Build Index page before searching.",
                details=details,
            )
        return self._engine

    @property
    def metadata(self) -> pd.DataFrame:
        return self.engine.metadata

    @property
    def meta_deduped(self) -> pd.DataFrame:
        return self.engine.meta_deduped

    @property
    def has_engine(self) -> bool:
        return self._engine is not None

    def get_search_record(self, search_id: str) -> SearchRecord | None:
        return self.cache.get(search_id)

    def reload_index(self, index_dir: str | Path) -> None:
        new_index_dir = Path(index_dir)
        self.settings.index_dir = str(new_index_dir)
        self.index_dir = new_index_dir
        self.repo_root = self.index_dir.parent
        self.cache = SearchCache(
            max_entries=self.settings.search_cache_max_entries,
            ttl_seconds=self.settings.search_cache_ttl_seconds,
        )
        if not self._load_engine_if_available(self.index_dir):
            raise ValidationAppError(
                f"Failed to load index bundle from '{self.index_dir}'.",
                details={
                    "index_dir": str(self.index_dir),
                    "load_error": self._engine_load_error or "Unknown error",
                },
            )

    def capabilities(self) -> dict[str, Any]:
        if self._engine is None:
            return {
                "index_loaded": False,
                "index_dir": str(self.index_dir),
                "primary_key": "",
                "company_name_col": "",
                "fts_table_name": "",
                "exact_fts_table_name": "",
                "supports_quoted_exact_keywords": False,
                "supports_exact_fallback": False,
                "supports_expression_queries": False,
                "supports_pagination": True,
                "supports_highlights": True,
                "search_cache_max_entries": self.settings.search_cache_max_entries,
                "search_cache_ttl_seconds": self.settings.search_cache_ttl_seconds,
            }
        engine_caps = dict(self._engine.get_capabilities())
        engine_caps.update({
            "index_loaded": self.index_dir.exists(),
            "supports_quoted_exact_keywords": engine_caps.get("supports_exact_quotes", True),
            "supports_exact_fallback": engine_caps.get("supports_raw_exact_fallback", True),
            "supports_pagination": True,
            "supports_highlights": True,
            "search_cache_max_entries": self.settings.search_cache_max_entries,
            "search_cache_ttl_seconds": self.settings.search_cache_ttl_seconds,
        })
        return engine_caps

    def _normalize_keywords(self, keywords: list[KeywordInput | dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for idx, kw in enumerate(keywords, start=1):
            if isinstance(kw, KeywordInput):
                data = kw.model_dump()
            else:
                data = dict(kw)
            try:
                serial = int(data.get("serial", idx))
            except (TypeError, ValueError):
                serial = idx
            normalized.append(
                {
                    "serial": serial,
                    "keyword": str(data.get("keyword", "")).strip(),
                    "mode": data.get("mode", "lexical"),
                    "action": data.get("action", "include"),
                    "weight": max(1, int(data.get("weight", 1) or 1)),
                }
            )
        return normalized

    def _sanitize_value(self, value: Any) -> Any:
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
        except TypeError:
            pass
        if isinstance(value, (str, int, float, bool)):
            return value
        if hasattr(value, "item"):
            try:
                return value.item()
            except Exception:
                pass
        return str(value)

    def get_company_metadata(self, primary_key_value: str | None) -> dict[str, Any]:
        pk = str(primary_key_value or "").strip()
        if not pk:
            return {}

        engine = self.engine
        metadata_frame = engine.meta_indexed
        if pk not in metadata_frame.index:
            return {}

        meta_row = metadata_frame.loc[pk]
        if isinstance(meta_row, pd.DataFrame):
            meta_row = meta_row.iloc[0]
        return {column: self._sanitize_value(meta_row[column]) for column in metadata_frame.columns}

    def _materialize_rows(self, rows: list[dict[str, Any]], include_metadata: bool) -> list[dict[str, Any]]:
        engine = self.engine
        metadata_frame = engine.meta_indexed
        materialized = []
        for row in rows:
            pk = str(row.get("primary_key_value", "")).strip()
            meta = {}
            if include_metadata and pk in metadata_frame.index:
                meta_row = metadata_frame.loc[pk]
                if isinstance(meta_row, pd.DataFrame):
                    meta_row = meta_row.iloc[0]
                meta = {col: self._sanitize_value(meta_row[col]) for col in metadata_frame.columns}
            materialized.append(
                {
                    "primary_key_value": pk,
                    "company_name": engine.get_company_name(pk),
                    "rowid": self._sanitize_value(row.get("rowid")),
                    "relevance": float(row.get("relevance", 0.0) or 0.0),
                    "completeness": float(row.get("completeness", 0.0) or 0.0),
                    "composite_score": float(row.get("composite_score", 0.0) or 0.0),
                    "keywords_matched": int(row.get("keywords_matched", 0) or 0),
                    "n_keywords": int(row.get("n_keywords", 0) or 0),
                    "matched_keywords": list(row.get("matched_keywords", [])),
                    "matched_serials": [int(value) for value in row.get("matched_serials", [])],
                    "matches": list(row.get("matches", [])),
                    "metadata": meta,
                }
            )
        return materialized

    def _clamp_page(self, page: int, page_size: int) -> tuple[int, int]:
        return max(1, int(page)), min(max(1, int(page_size)), self.settings.max_page_size)

    def _build_keyword_hit_counts(self, keywords: list[dict[str, Any]]) -> dict[str, int]:
        include_keywords = [
            kw for kw in keywords
            if kw.get("action") == "include" and _keyword_has_searchable_text(kw.get("keyword"))
        ]
        if not include_keywords:
            return {}
        engine = self.engine

        def _count_one(kw_cfg: dict[str, Any]) -> tuple[str, int]:
            keyword = kw_cfg["keyword"]
            return keyword, engine.count_keyword_hits(keyword)

        hit_counts: dict[str, int] = {}
        for keyword_text, count in _safe_threadpool_map(include_keywords, _count_one, max_workers=8):
            hit_counts[keyword_text] = count
        return hit_counts

    def _apply_quick_filter(self, rows: list[dict[str, Any]], needle: str) -> list[dict[str, Any]]:
        """Case-insensitive substring match across company name + metadata values.

        Runs purely in Python over the cached materialized rows, so it works
        inside the infinite-row-model flow without re-hitting SQLite.
        """
        if not needle:
            return rows
        n = needle.strip().lower()
        if not n:
            return rows
        engine = self.engine
        metadata_frame = engine.meta_indexed
        meta_cols = list(metadata_frame.columns)
        out: list[dict[str, Any]] = []
        for row in rows:
            pk = str(row.get("primary_key_value", "")).strip()
            if n in (engine.get_company_name(pk) or "").lower():
                out.append(row)
                continue
            if n in pk.lower():
                out.append(row)
                continue
            matched = False
            if pk in metadata_frame.index:
                meta_row = metadata_frame.loc[pk]
                if isinstance(meta_row, pd.DataFrame):
                    meta_row = meta_row.iloc[0]
                for col in meta_cols:
                    v = meta_row[col]
                    if v is None:
                        continue
                    try:
                        if pd.isna(v):
                            continue
                    except TypeError:
                        pass
                    if n in str(v).lower():
                        matched = True
                        break
            if matched:
                out.append(row)
                continue
            # Also match against matched_keywords
            for kw in row.get("matched_keywords", []) or []:
                if n in str(kw).lower():
                    out.append(row)
                    break
        return out

    def _apply_filter_model(self, rows: list[dict[str, Any]], filter_model: dict[str, Any]) -> list[dict[str, Any]]:
        """Handle AG Grid style per-column filters.

        Supported filterType/types (community):
          text:   contains, notContains, equals, notEqual, startsWith, endsWith, blank, notBlank
          number: equals, notEqual, greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual, inRange
        """
        if not filter_model:
            return rows

        engine = self.engine
        metadata_frame = engine.meta_indexed
        meta_cols_lower = {c.lower(): c for c in metadata_frame.columns}

        def _row_value(row: dict[str, Any], col_id: str) -> Any:
            # Well-known top-level columns
            if col_id == "company_name":
                return engine.get_company_name(str(row.get("primary_key_value", "")).strip()) or ""
            if col_id in {"composite_score", "completeness", "relevance", "keywords_matched", "n_keywords"}:
                return row.get(col_id)
            if col_id == "primary_key_value":
                return row.get("primary_key_value", "")
            # Metadata lookup (match by column id case-insensitive)
            pk = str(row.get("primary_key_value", "")).strip()
            if pk in metadata_frame.index:
                meta_row = metadata_frame.loc[pk]
                if isinstance(meta_row, pd.DataFrame):
                    meta_row = meta_row.iloc[0]
                col = meta_cols_lower.get(col_id.lower()) or col_id
                if col in meta_row.index:
                    val = meta_row[col]
                    try:
                        if pd.isna(val):
                            return None
                    except TypeError:
                        pass
                    return val
            return None

        def _match_text(value: Any, f_type: str, needle: str) -> bool:
            s = "" if value is None else str(value)
            sl = s.lower()
            n = (needle or "").lower()
            if f_type == "blank":
                return not s.strip()
            if f_type == "notBlank":
                return bool(s.strip())
            if not n:
                return True
            if f_type == "contains":
                return n in sl
            if f_type == "notContains":
                return n not in sl
            if f_type == "equals":
                return sl == n
            if f_type == "notEqual":
                return sl != n
            if f_type == "startsWith":
                return sl.startswith(n)
            if f_type == "endsWith":
                return sl.endswith(n)
            return n in sl

        def _match_number(value: Any, f_type: str, a: Any, b: Any = None) -> bool:
            try:
                x = float(value)
            except (TypeError, ValueError):
                return False
            try:
                fa = float(a) if a is not None else None
            except (TypeError, ValueError):
                fa = None
            try:
                fb = float(b) if b is not None else None
            except (TypeError, ValueError):
                fb = None
            if f_type == "equals":
                return fa is not None and x == fa
            if f_type == "notEqual":
                return fa is not None and x != fa
            if f_type == "greaterThan":
                return fa is not None and x > fa
            if f_type == "greaterThanOrEqual":
                return fa is not None and x >= fa
            if f_type == "lessThan":
                return fa is not None and x < fa
            if f_type == "lessThanOrEqual":
                return fa is not None and x <= fa
            if f_type == "inRange":
                return fa is not None and fb is not None and fa <= x <= fb
            return False

        def _row_matches(row: dict[str, Any]) -> bool:
            for col_id, spec in filter_model.items():
                if not isinstance(spec, dict):
                    continue

                def _matches_one(condition: dict[str, Any]) -> bool:
                    filter_type = condition.get("filterType", spec.get("filterType", "text"))
                    f_type = condition.get("type", "contains")
                    value = _row_value(row, col_id)
                    if filter_type == "number":
                        return _match_number(value, f_type, condition.get("filter"), condition.get("filterTo"))
                    return _match_text(value, f_type, str(condition.get("filter", "")))

                conditions = spec.get("conditions")
                if not isinstance(conditions, list) or not conditions:
                    legacy_conditions = [
                        condition
                        for condition in (spec.get("condition1"), spec.get("condition2"))
                        if isinstance(condition, dict)
                    ]
                    conditions = legacy_conditions

                if conditions:
                    operator = str(spec.get("operator", "AND")).upper()
                    condition_results = [_matches_one(condition) for condition in conditions if isinstance(condition, dict)]
                    if not condition_results:
                        continue
                    if operator == "OR":
                        if not any(condition_results):
                            return False
                    elif not all(condition_results):
                        return False
                elif not _matches_one(spec):
                    return False
            return True

        return [row for row in rows if _row_matches(row)]

    def _apply_sort(self, rows: list[dict[str, Any]], sort_model: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not sort_model:
            return rows

        engine = self.engine
        metadata_frame = engine.meta_indexed
        meta_cols_lower = {c.lower(): c for c in metadata_frame.columns}

        def _key_for(row: dict[str, Any], col_id: str) -> Any:
            if col_id == "company_name":
                return (engine.get_company_name(str(row.get("primary_key_value", "")).strip()) or "").lower()
            if col_id in {"composite_score", "completeness", "relevance", "keywords_matched", "n_keywords"}:
                try:
                    return float(row.get(col_id) or 0)
                except (TypeError, ValueError):
                    return 0.0
            if col_id == "primary_key_value":
                return str(row.get("primary_key_value", "")).lower()
            pk = str(row.get("primary_key_value", "")).strip()
            if pk in metadata_frame.index:
                meta_row = metadata_frame.loc[pk]
                if isinstance(meta_row, pd.DataFrame):
                    meta_row = meta_row.iloc[0]
                col = meta_cols_lower.get(col_id.lower()) or col_id
                if col in meta_row.index:
                    v = meta_row[col]
                    try:
                        if pd.isna(v):
                            return ""
                    except TypeError:
                        pass
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        return str(v).lower()
            return ""

        # Sort by the last item first so earlier items take precedence.
        rows_copy = list(rows)
        for spec in reversed(sort_model):
            col_id = spec.get("colId")
            direction = (spec.get("sort") or "asc").lower()
            reverse = direction == "desc"
            if not col_id:
                continue
            try:
                rows_copy.sort(key=lambda r, c=col_id: _key_for(r, c), reverse=reverse)
            except TypeError:
                # Mixed types — stringify and retry.
                rows_copy.sort(key=lambda r, c=col_id: str(_key_for(r, c)), reverse=reverse)
        return rows_copy

    def _build_page_response(
        self,
        record: SearchRecord,
        *,
        page: int,
        page_size: int,
        include_highlights: bool,
        include_metadata: bool,
        cache_hit: bool | None,
        base_timings_ms: dict[str, float] | None = None,
        quick_filter: str | None = None,
        filter_model: dict[str, Any] | None = None,
        sort_model: list[dict[str, Any]] | None = None,
    ) -> SearchPageResponse:
        response_started = time.perf_counter()
        engine = self.engine
        page, page_size = self._clamp_page(page, page_size)
        rows = record.results
        if quick_filter:
            rows = self._apply_quick_filter(rows, quick_filter)
        if filter_model:
            rows = self._apply_filter_model(rows, filter_model)
        if sort_model:
            rows = self._apply_sort(rows, sort_model)
        page_count = max(1, (len(rows) + page_size - 1) // page_size) if rows else 1
        start = (page - 1) * page_size
        end = min(start + page_size, len(rows))
        page_rows = rows[start:end]
        highlight_started = time.perf_counter()
        if include_highlights and page_rows and any(not row.get("matches") for row in page_rows):
            engine.attach_highlights(page_rows, record.keywords, max_results=len(page_rows))
        highlight_ms = round((time.perf_counter() - highlight_started) * 1000, 2)
        materialize_started = time.perf_counter()
        materialized_rows = self._materialize_rows(page_rows, include_metadata=include_metadata)
        materialize_ms = round((time.perf_counter() - materialize_started) * 1000, 2)
        timings_ms = dict(base_timings_ms or {})
        if include_highlights:
            timings_ms["highlight"] = highlight_ms
        timings_ms["materialize"] = materialize_ms
        timings_ms["page_total"] = round((time.perf_counter() - response_started) * 1000, 2)
        return SearchPageResponse(
            search_id=record.search_id,
            search_mode=record.search_mode,
            query_expression=record.query_expression,
            parsed_query=record.parsed_query,
            total_count=len(rows),
            page=page,
            page_size=page_size,
            page_count=page_count,
            results=materialized_rows,
            keyword_hit_counts=record.keyword_hit_counts,
            cache_hit=cache_hit,
            timings_ms=timings_ms,
        )

    def execute_search(self, payload: SearchExecuteRequest) -> SearchPageResponse:
        started = time.perf_counter()
        engine = self.engine
        keywords = self._normalize_keywords(payload.keywords)
        query_expression = (payload.query_expression or "").strip()
        if not any(_keyword_has_searchable_text(kw.get("keyword")) for kw in keywords):
            raise ValidationAppError("Please enter at least one keyword.")

        search_started = time.perf_counter()
        if query_expression:
            ast, error = parse_expression(query_expression)
            if error:
                raise ValidationAppError(error)
            errors, warnings = validate_expression(ast, len(keywords), keywords)
            if errors:
                raise ValidationAppError("Invalid query expression", details={"errors": errors, "warnings": warnings})
            results, keyword_hit_counts = engine.execute_expression_query(keywords, ast)
            search_mode = "expression"
            parsed_query = humanize_expression(ast, keywords)
        else:
            results, keyword_hit_counts = engine.execute_query(keywords)
            search_mode = "default"
            parsed_query = ""
        search_ms = round((time.perf_counter() - search_started) * 1000, 2)

        hit_count_started = time.perf_counter()
        if not keyword_hit_counts:
            keyword_hit_counts = self._build_keyword_hit_counts(keywords)
        hit_count_ms = round((time.perf_counter() - hit_count_started) * 1000, 2)

        search_id = uuid.uuid4().hex
        timings_ms = {
            "search": search_ms,
            "keyword_hit_counts": hit_count_ms,
            "total": round((time.perf_counter() - started) * 1000, 2),
        }
        record = SearchRecord(
            search_id=search_id,
            keywords=keywords,
            query_expression=query_expression,
            search_mode=search_mode,
            parsed_query=parsed_query,
            results=results,
            keyword_hit_counts=keyword_hit_counts,
            timings_ms=timings_ms,
            created_at=time.time(),
        )
        self.cache.put(record)
        try:
            self._history.record_search(
                {
                    "keywords": keywords,
                    "query_expression": query_expression,
                    "parsed_query": parsed_query,
                    "search_mode": search_mode,
                    "result_count": len(results),
                    "page": payload.page,
                    "page_size": payload.page_size or self.settings.default_page_size,
                    "include_highlights": payload.include_highlights,
                    "include_metadata": payload.include_metadata,
                    "keyword_hit_counts": keyword_hit_counts,
                    "timings_ms": timings_ms,
                }
            )
        except Exception:
            logging.getLogger(__name__).exception("Failed to persist search history")
        return self._build_page_response(
            record,
            page=payload.page,
            page_size=payload.page_size or self.settings.default_page_size,
            include_highlights=payload.include_highlights,
            include_metadata=payload.include_metadata,
            cache_hit=False,
            base_timings_ms=timings_ms,
        )

    def get_search_page(
        self,
        search_id: str,
        *,
        page: int = 1,
        page_size: int = 100,
        include_highlights: bool = False,
        include_metadata: bool = True,
        quick_filter: str | None = None,
        filter_model: dict[str, Any] | None = None,
        sort_model: list[dict[str, Any]] | None = None,
    ) -> SearchPageResponse:
        record = self.cache.get(search_id)
        if record is None:
            raise NotFoundError(f"Search '{search_id}' not found or has expired.")
        return self._build_page_response(
            record,
            page=page,
            page_size=page_size,
            include_highlights=include_highlights,
            include_metadata=include_metadata,
            cache_hit=True,
            base_timings_ms=dict(record.timings_ms),
            quick_filter=quick_filter,
            filter_model=filter_model,
            sort_model=sort_model,
        )
