from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Any, Iterator

import pandas as pd

from app.core.errors import NotFoundError
from app.services.lists import ListsService
from app.services.search import SearchRecord, SearchService
from company_screener.engine import _normalize_url, _unique_preserve_order


MASTER_COLS_ORDERED = [
    "Crescendo ID",
    "Company",
    "ECID",
    "PBID",
    "Company Status",
    "Annual Revenue",
    "Sales Range",
    "Sales Range Category",
    "NAICS Description",
    "City",
    "Zip Code",
    "Website",
    "Segment",
    "Region",
    "Market",
    "Banker Name",
    "R12 Call Count",
    "CEO Connectivity Rating",
    "IB Sector",
    "IB Sub Sector",
    "IB Sub Sector Level 2",
    "IB Microsector",
    "IB Client Executive",
    "Sponsors",
    "Sponsor Type",
    "Protocol Tier",
    "Company Description",
    "Company Description Source",
    "Pitchbook Description",
    "Factset Description",
    "Demandbase Description",
    "Salesforce Description",
    "Dealogic Description",
    "Offerings",
    "Pitchbook Keywords",
    "iSpreso Statement Date",
    "Revenue",
    "Revenue Growth Rate",
    "EBITDA",
    "EBITDA Growth Rate",
    "Debt",
    "Location of HQ",
    "Pitchbook Ownership Status",
    "LOB",
    "Sub Sub LOB",
    "Sub Sub Sub LOB",
    "Sub Sub Sub Sub LOB",
    "Quality of connection",
    "Quality Criteria",
    "Private Banker",
    "Private Bank Flag",
    "High Potential Growth Signal",
    "Sales Size Growth Signal",
    "Payroll Growth Signal",
    "Deposits Growth Signal",
    "International",
    "Payments Growth Signal",
    "Concatenated Description",
    "MNC Filter",
]

LLM_DESCRIPTION_COLUMNS = [
    "Company Description",
    "Pitchbook Description",
    "Factset Description",
    "Demandbase Description",
    "Salesforce Description",
    "Dealogic Description",
    "Offerings",
    "Pitchbook Keywords",
]


@dataclass(slots=True)
class ExportArtifact:
    filename: str
    media_type: str
    row_count: int
    filepath: str | None = None
    content: bytes | None = None

    def iter_chunks(self, chunk_size: int = 65536) -> Iterator[bytes]:
        if self.content is not None:
            yield self.content
            return

        if self.filepath and os.path.exists(self.filepath):
            try:
                with open(self.filepath, "rb") as f:
                    while chunk := f.read(chunk_size):
                        yield chunk
            finally:
                try:
                    os.unlink(self.filepath)
                except OSError:
                    pass


def _safe_slug(value: str) -> str:
    clean = re.sub(r"[^\w]+", "-", str(value)).strip("-")
    return clean[:50]


def _search_filename(record: SearchRecord) -> str:
    kw_slugs = "_".join(_safe_slug(keyword.get("keyword", "")) for keyword in record.keywords[:3] if keyword.get("keyword"))
    date_str = datetime.now().strftime("%Y%m%d")
    base = f"screening_{kw_slugs}_{date_str}" if kw_slugs else f"screening_{date_str}"
    return base


def _list_filename(name: str) -> str:
    clean = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return clean or "list"


def dataframe_to_csv_file(df: pd.DataFrame) -> str:
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    df.to_csv(path, index=False)
    return path


def dataframe_to_xlsx_file(df: pd.DataFrame, sheet_name: str) -> str:
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    # Pandas + XlsxWriter's constant_memory mode can silently blank string cells
    # on larger exports because pandas writes by column block rather than strict
    # row order. Use the default writer mode so mixed metadata columns survive.
    with pd.ExcelWriter(
        path,
        engine="xlsxwriter",
        engine_kwargs={
            "options": {
                "strings_to_urls": False,
            }
        },
    ) as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
    return path


def _format_match_highlights(matches: list[dict[str, Any]], max_matches: int = 10) -> str:
    lines = []
    for match in matches[:max_matches]:
        lines.append(f"[{match['keyword']}|{match['source']}] {match['sentence']}")
    return " ||| ".join(lines)


def _concat_llm_description(row: pd.Series) -> str:
    parts: list[str] = []
    for column in LLM_DESCRIPTION_COLUMNS:
        value = row.get(column, "")
        if value is None:
            continue
        text = str(value).strip()
        if text and text.lower() != "nan":
            parts.append(text)
    return "\n".join(parts)


class ExportService:
    def __init__(self, search_service: SearchService, lists_service: ListsService) -> None:
        self.search_service = search_service
        self.lists_service = lists_service

    def _build_search_export_df(
        self,
        record: SearchRecord,
        *,
        include_highlights: bool,
        include_metadata: bool,
        highlight_limit: int,
        layout: str = "standard",
    ) -> pd.DataFrame:
        engine = self.search_service.engine
        results = [dict(row) for row in record.results]
        if include_highlights and results:
            engine.attach_highlights(results[: min(highlight_limit, len(results))], record.keywords, max_results=min(highlight_limit, len(results)))

        score_rows: list[dict[str, Any]] = []
        for row in results:
            score_row: dict[str, Any] = {
                self.search_service.primary_key: row["primary_key_value"],
                "Composite Score": round(row.get("composite_score", 0), 2),
                "Relevance": round(row.get("relevance", 0), 2),
                "Match %": f"{row.get('completeness', 0) * 100:.0f}%",
                "Keywords Hit": f"{row.get('keywords_matched', 0)}/{row.get('n_keywords', 0)}",
                "Matched Keywords": ", ".join(row.get("matched_keywords", [])),
                "Match Highlights": _format_match_highlights(row.get("matches", [])),
            }
            if record.search_mode == "expression":
                score_row["Query Expression"] = record.query_expression
            score_rows.append(score_row)

        score_df = pd.DataFrame(score_rows)
        if score_df.empty:
            return score_df

        if include_metadata:
            meta_df = engine.meta_deduped
            merged = score_df.merge(meta_df, on=self.search_service.primary_key, how="left", suffixes=("", "_meta"))
        else:
            merged = score_df

        if "Website" in merged.columns:
            merged["Open Website"] = merged["Website"].apply(_normalize_url)
        else:
            merged["Open Website"] = ""

        if layout == "pitchbook":
            def _split_hq(value: Any) -> tuple[str, str]:
                if value is None:
                    return "", ""
                text = str(value).strip()
                if not text or text.lower() == "nan":
                    return "", ""
                if "," in text:
                    city, state = text.split(",", 1)
                    return city.strip(), state.strip()
                return text, ""

            company_series = merged["Company"] if "Company" in merged.columns else pd.Series([""] * len(merged))
            website_series = (
                merged["Website"] if "Website" in merged.columns else merged.get("Open Website", pd.Series([""] * len(merged)))
            )
            hq_series = merged["Location of HQ"] if "Location of HQ" in merged.columns else pd.Series([""] * len(merged))
            split = hq_series.apply(_split_hq)
            city_series = split.apply(lambda pair: pair[0])
            state_series = split.apply(lambda pair: pair[1])
            pb_df = pd.DataFrame(
                {
                    "Company": company_series.fillna("").astype(str).values,
                    "Website": website_series.fillna("").astype(str).values,
                    "City": city_series.values,
                    "State": state_series.values,
                }
            )
            return pb_df

        if layout == "llm":
            company_series = merged["Company"] if "Company" in merged.columns else pd.Series([""] * len(merged))
            website_series = merged["Website"] if "Website" in merged.columns else pd.Series([""] * len(merged))
            llm_df = pd.DataFrame(
                {
                    "index": pd.Series(range(1, len(merged) + 1), dtype="int64"),
                    "Company": company_series.fillna("").astype(str).values,
                    "Website": website_series.fillna("").astype(str).values,
                    "Description": merged.apply(_concat_llm_description, axis=1).values,
                }
            )
            return llm_df

        ordered_cols = _unique_preserve_order(
            [
                "Composite Score",
                "Relevance",
                "Match %",
                "Keywords Hit",
                "Matched Keywords",
                "Query Expression" if record.search_mode == "expression" else None,
                self.search_service.primary_key,
                "Company",
                "Open Website",
                "Match Highlights",
            ]
        )
        master_cols = _unique_preserve_order([self.search_service.primary_key, *MASTER_COLS_ORDERED])
        ordered_cols = [c for c in ordered_cols if c is not None]
        ordered_cols += [c for c in master_cols if c in merged.columns and c not in ordered_cols]
        ordered_cols += [c for c in merged.columns if c not in ordered_cols]
        ordered_cols = [c for c in ordered_cols if c in merged.columns]
        return merged[ordered_cols]

    def _build_list_export_df(
        self,
        name: str,
        include_metadata: bool = True,
        layout: str = "standard",
    ) -> pd.DataFrame:
        list_detail = self.lists_service.get_list(name)
        if list_detail is None:
            raise NotFoundError(f"List '{name}' not found.")

        pk = self.search_service.primary_key or "Crescendo ID"
        companies = list_detail.companies
        primary_keys = [
            (company.primary_key_value or company.company or company.crescendo_id or "").strip()
            for company in companies
        ]
        kw_map = {
            (company.primary_key_value or company.company or company.crescendo_id or "").strip(): ", ".join(company.source_keywords)
            for company in companies
        }
        added_map = {
            (company.primary_key_value or company.company or company.crescendo_id or "").strip(): company.added_at
            for company in companies
        }

        score_df = pd.DataFrame(
            {
                pk: primary_keys,
                "Keywords (all searches)": [kw_map.get(value, "") for value in primary_keys],
                "Added": [added_map.get(value, "") for value in primary_keys],
            }
        )
        if score_df.empty:
            return score_df

        effective_include_metadata = include_metadata or layout == "pitchbook"
        if effective_include_metadata:
            engine = self.search_service.engine
            pk = self.search_service.primary_key
            list_display_cols = _unique_preserve_order([pk, *MASTER_COLS_ORDERED])
            meta_subset = engine.meta_deduped[[c for c in list_display_cols if c in engine.meta_deduped.columns]]
            merged = score_df.merge(meta_subset, on=pk, how="left", suffixes=("", "_meta"))
        else:
            merged = score_df

        if "Website" in merged.columns:
            merged["Open Website"] = merged["Website"].apply(_normalize_url)
        else:
            merged["Open Website"] = ""

        if layout == "pitchbook":
            def _split_hq(value: Any) -> tuple[str, str]:
                if value is None:
                    return "", ""
                text = str(value).strip()
                if not text or text.lower() == "nan":
                    return "", ""
                if "," in text:
                    city, state = text.split(",", 1)
                    return city.strip(), state.strip()
                return text, ""

            company_series = merged["Company"] if "Company" in merged.columns else pd.Series([""] * len(merged))
            website_series = (
                merged["Website"] if "Website" in merged.columns else merged.get("Open Website", pd.Series([""] * len(merged)))
            )
            hq_series = merged["Location of HQ"] if "Location of HQ" in merged.columns else pd.Series([""] * len(merged))
            split = hq_series.apply(_split_hq)
            city_series = split.apply(lambda pair: pair[0])
            state_series = split.apply(lambda pair: pair[1])
            return pd.DataFrame(
                {
                    "Company": company_series.fillna("").astype(str).values,
                    "Website": website_series.fillna("").astype(str).values,
                    "City": city_series.values,
                    "State": state_series.values,
                }
            )

        if layout == "llm":
            company_series = merged["Company"] if "Company" in merged.columns else pd.Series([""] * len(merged))
            website_series = merged["Website"] if "Website" in merged.columns else pd.Series([""] * len(merged))
            return pd.DataFrame(
                {
                    "index": pd.Series(range(1, len(merged) + 1), dtype="int64"),
                    "Company": company_series.fillna("").astype(str).values,
                    "Website": website_series.fillna("").astype(str).values,
                    "Description": merged.apply(_concat_llm_description, axis=1).values,
                }
            )

        ordered_cols = _unique_preserve_order(
            [
                "Keywords (all searches)",
                "Added",
                pk,
                "Company",
                "Open Website",
                *MASTER_COLS_ORDERED,
            ]
        )
        ordered_cols = [c for c in ordered_cols if c in merged.columns]
        ordered_cols += [c for c in merged.columns if c not in ordered_cols]
        return merged[ordered_cols]

    def export_search(
        self,
        search_id: str,
        *,
        format: str = "xlsx",
        include_highlights: bool = False,
        include_metadata: bool = True,
        highlight_limit: int = 50,
        layout: str = "standard",
    ) -> ExportArtifact:
        record = self.search_service.get_search_record(search_id)
        if record is None:
            raise NotFoundError(f"Search '{search_id}' not found or has expired.")

        df = self._build_search_export_df(
            record,
            include_highlights=include_highlights,
            include_metadata=include_metadata,
            highlight_limit=highlight_limit,
            layout=layout,
        )
        base = _search_filename(record)
        if layout == "pitchbook":
            base = f"{base}_pb"
        elif layout == "llm":
            base = f"{base}_llm"
        if format == "csv":
            filepath = dataframe_to_csv_file(df)
            return ExportArtifact(
                filename=f"{base}.csv",
                media_type="text/csv",
                filepath=filepath,
                row_count=len(df),
            )
        filepath = dataframe_to_xlsx_file(df, "Results")
        return ExportArtifact(
            filename=f"{base}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filepath=filepath,
            row_count=len(df),
        )

    def export_list(
        self,
        name: str,
        *,
        format: str = "xlsx",
        include_metadata: bool = True,
        layout: str = "standard",
    ) -> ExportArtifact:
        df = self._build_list_export_df(name, include_metadata=include_metadata, layout=layout)
        base = _list_filename(name)
        if layout == "pitchbook":
            base = f"{base}_pb"
        elif layout == "llm":
            base = f"{base}_llm"
        if format == "csv":
            filepath = dataframe_to_csv_file(df)
            return ExportArtifact(
                filename=f"{base}.csv",
                media_type="text/csv",
                filepath=filepath,
                row_count=len(df),
            )
        filepath = dataframe_to_xlsx_file(df, "List")
        return ExportArtifact(
            filename=f"{base}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filepath=filepath,
            row_count=len(df),
        )
