from __future__ import annotations

from io import StringIO
import time

import pandas as pd

from app.schemas.keywords import (
    ExpressionValidateRequest,
    ExpressionValidateResponse,
    KeywordParseRequest,
    KeywordParseResponse,
    KeywordTemplateResponse,
)
from app.schemas.search import KeywordInput
from company_screener.engine import humanize_expression, parse_expression, validate_expression

KEYWORD_TEMPLATE_CSV = (
    "#,keyword,mode,action,weight\n"
    "1,solar energy,lexical,include,1\n"
    "2,battery storage,lexical,include,2\n"
    "3,fossil fuel,lexical,exclude,1\n"
)


class KeywordsService:
    def template(self) -> KeywordTemplateResponse:
        return KeywordTemplateResponse(filename="keyword_template.csv", content=KEYWORD_TEMPLATE_CSV)

    def parse_keywords(self, payload: KeywordParseRequest | str) -> KeywordParseResponse:
        started = time.perf_counter()
        text = payload.text if isinstance(payload, KeywordParseRequest) else str(payload)
        errors: list[str] = []
        warnings: list[str] = []

        lines = [line for line in text.strip().splitlines() if line.strip()]
        if not lines:
            return KeywordParseResponse(
                errors=["No data found."],
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        has_commas = any("," in line for line in lines)
        if not has_commas:
            keywords = [
                KeywordInput(serial=index, keyword=line.strip(), mode="lexical", action="include", weight=1)
                for index, line in enumerate(lines, start=1)
                if line.strip()
            ]
            if not keywords:
                errors.append("No valid keywords found.")
            return KeywordParseResponse(
                keywords=keywords,
                errors=errors,
                warnings=warnings,
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        try:
            df = pd.read_csv(StringIO(text), skipinitialspace=True)
        except pd.errors.ParserError as exc:
            return KeywordParseResponse(
                errors=[f"Failed to parse CSV: {exc}"],
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        df.columns = df.columns.str.strip().str.lower()
        serial_col = "#" if "#" in df.columns else ("serial" if "serial" in df.columns else None)

        if serial_col is not None:
            try:
                df[serial_col] = pd.to_numeric(df[serial_col], errors="raise").astype(int)
            except (ValueError, TypeError):
                return KeywordParseResponse(
                    errors=[f"'{serial_col}' column must contain only integers."],
                    timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
                )
            if df[serial_col].duplicated().any():
                dupes = df[serial_col][df[serial_col].duplicated()].unique().tolist()
                return KeywordParseResponse(
                    errors=[f"Duplicate '{serial_col}' values: {dupes}."],
                    timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
                )
            if (df[serial_col] < 1).any():
                return KeywordParseResponse(
                    errors=[f"'{serial_col}' values must be >= 1."],
                    timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
                )
            df = df.sort_values(serial_col).reset_index(drop=True)

        recognized = {"keyword", "mode", "action", "weight", "#", "serial"}
        extra = set(df.columns) - recognized
        if extra:
            warnings.append(f"Ignoring unrecognized columns: {', '.join(sorted(extra))}")

        if "keyword" not in df.columns:
            if len(df.columns) == 1:
                df.columns = ["keyword"]
            else:
                return KeywordParseResponse(
                    errors=["CSV must contain a 'keyword' column."],
                    warnings=warnings,
                    timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
                )

        df["keyword"] = df["keyword"].astype(str).str.strip()
        empty_mask = (df["keyword"] == "") | (df["keyword"].str.lower() == "nan")
        dropped = int(empty_mask.sum())
        df = df[~empty_mask].reset_index(drop=True)
        if len(df) == 0:
            return KeywordParseResponse(
                errors=["No valid keywords found (all rows empty)."],
                warnings=warnings,
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )
        if dropped:
            warnings.append(f"Skipped {dropped} row(s) with empty keywords.")

        if "mode" not in df.columns:
            df["mode"] = "lexical"
        else:
            df["mode"] = df["mode"].astype(str).str.strip().str.lower()

        if "action" not in df.columns:
            df["action"] = "include"
        else:
            df["action"] = df["action"].astype(str).str.strip().str.lower()

        if "weight" not in df.columns:
            df["weight"] = 1

        bad_modes = df[~df["mode"].isin(["lexical", "semantic"])]
        if len(bad_modes) > 0:
            rows = ", ".join(str(r + 2) for r in bad_modes.index[:5])
            errors.append(f"Invalid mode at row(s) {rows}. Must be 'lexical' or 'semantic'.")

        bad_actions = df[~df["action"].isin(["include", "exclude"])]
        if len(bad_actions) > 0:
            rows = ", ".join(str(r + 2) for r in bad_actions.index[:5])
            errors.append(f"Invalid action at row(s) {rows}. Must be 'include' or 'exclude'.")

        try:
            df["weight"] = pd.to_numeric(df["weight"], errors="raise").astype(int)
            if (df["weight"] < 1).any():
                errors.append("All weight values must be >= 1.")
        except (ValueError, TypeError):
            errors.append("'weight' column must contain only integers.")

        if errors:
            return KeywordParseResponse(
                errors=errors,
                warnings=warnings,
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        keywords: list[KeywordInput] = []
        for idx, row in df.iterrows():
            if serial_col is not None:
                serial = int(row[serial_col])
            else:
                serial = idx + 1
            keywords.append(
                KeywordInput(
                    serial=serial,
                    keyword=row["keyword"],
                    mode=row["mode"],
                    action=row["action"],
                    weight=int(row["weight"]),
                )
            )
        return KeywordParseResponse(
            keywords=keywords,
            errors=errors,
            warnings=warnings,
            timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
        )

    def validate_expression(self, payload: ExpressionValidateRequest) -> ExpressionValidateResponse:
        started = time.perf_counter()
        query_expression = payload.query_expression.strip()
        if not query_expression:
            return ExpressionValidateResponse(
                valid=False,
                errors=["Expression is empty."],
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        ast, error = parse_expression(query_expression)
        if error:
            return ExpressionValidateResponse(
                valid=False,
                errors=[error],
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        keyword_dicts = [keyword.model_dump() for keyword in payload.keywords]
        errors, warnings = validate_expression(ast, len(keyword_dicts), keyword_dicts)
        if errors:
            return ExpressionValidateResponse(
                valid=False,
                errors=errors,
                warnings=warnings,
                timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
            )

        return ExpressionValidateResponse(
            valid=True,
            parsed_query=humanize_expression(ast, keyword_dicts),
            warnings=warnings,
            timings_ms={"total": round((time.perf_counter() - started) * 1000, 2)},
        )
