from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import pandas as pd


SCORING_CONFIG_PATH = Path(__file__).resolve().parents[1] / "scoring_config.json"


@dataclass(slots=True)
class IndexBuildProgress:
    stage: str
    percent: int
    message: str
    current: int | None = None
    total: int | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def model_dump(self) -> dict[str, Any]:
        payload = {
            "stage": self.stage,
            "percent": int(max(0, min(100, self.percent))),
            "message": self.message,
        }
        if self.current is not None:
            payload["current"] = int(self.current)
        if self.total is not None:
            payload["total"] = int(self.total)
        if self.details:
            payload["details"] = dict(self.details)
        return payload


@dataclass(slots=True)
class IndexBuildResult:
    input_path: str
    output_dir: str
    db_path: str
    parquet_path: str
    config_path: str
    primary_key: str
    company_name_col: str
    fts_table_name: str
    exact_fts_table_name: str
    num_companies: int

    def model_dump(self) -> dict[str, Any]:
        return {
            "input_path": self.input_path,
            "output_dir": self.output_dir,
            "db_path": self.db_path,
            "parquet_path": self.parquet_path,
            "config_path": self.config_path,
            "primary_key": self.primary_key,
            "company_name_col": self.company_name_col,
            "fts_table_name": self.fts_table_name,
            "exact_fts_table_name": self.exact_fts_table_name,
            "num_companies": self.num_companies,
        }


def load_scoring_config() -> dict[str, Any]:
    with SCORING_CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _normalize_company(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


PRIMARY_KEY_COLUMN = "Crescendo ID"
COMPANY_NAME_COLUMN = "Company"


def validate_company_primary_key(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize and validate the primary-key ('Crescendo ID') and display ('Company') columns."""
    if PRIMARY_KEY_COLUMN not in df.columns:
        raise ValueError(f"Missing required column: '{PRIMARY_KEY_COLUMN}'.")
    if COMPANY_NAME_COLUMN not in df.columns:
        raise ValueError(f"Missing required column: '{COMPANY_NAME_COLUMN}'.")

    df[PRIMARY_KEY_COLUMN] = df[PRIMARY_KEY_COLUMN].map(_normalize_company).astype(pd.StringDtype())
    df[COMPANY_NAME_COLUMN] = df[COMPANY_NAME_COLUMN].map(_normalize_company).astype(pd.StringDtype())

    blank_mask = df[PRIMARY_KEY_COLUMN].eq("")
    if blank_mask.any():
        excel_rows = [str(int(idx) + 2) for idx in df.index[blank_mask][:10]]
        suffix = " ..." if int(blank_mask.sum()) > 10 else ""
        raise ValueError(
            f"Column '{PRIMARY_KEY_COLUMN}' contains blank values. "
            f"First Excel rows: {', '.join(excel_rows)}{suffix}"
        )

    duplicate_ids = df.loc[df[PRIMARY_KEY_COLUMN].duplicated(keep=False), PRIMARY_KEY_COLUMN].drop_duplicates()
    if not duplicate_ids.empty:
        examples = ", ".join(f'"{value}"' for value in duplicate_ids.iloc[:10])
        suffix = " ..." if len(duplicate_ids) > 10 else ""
        raise ValueError(
            f"Column '{PRIMARY_KEY_COLUMN}' must be unique because it is the search primary key. "
            f"Duplicate values found: {examples}{suffix}"
        )

    return df


def _emit(
    progress_callback: Callable[[IndexBuildProgress], None] | None,
    *,
    stage: str,
    percent: int,
    message: str,
    current: int | None = None,
    total: int | None = None,
    **details: Any,
) -> None:
    if progress_callback is None:
        return
    progress_callback(
        IndexBuildProgress(
            stage=stage,
            percent=percent,
            message=message,
            current=current,
            total=total,
            details=details,
        )
    )


def build_sqlite_index(
    df: pd.DataFrame,
    db_path: str | Path,
    config: dict[str, Any],
    *,
    progress_callback: Callable[[IndexBuildProgress], None] | None = None,
) -> None:
    """Build SQLite database with stemmed + exact-match FTS5 indexes."""
    db_path = Path(db_path)
    if db_path.exists():
        db_path.unlink()

    source_columns = config["source_columns"]
    fts5_columns = config["fts5_column_names"]
    if len(source_columns) != len(fts5_columns):
        raise ValueError(
            "scoring_config.json is invalid: source_columns and fts5_column_names must have the same length."
        )

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE company_map (
            id INTEGER PRIMARY KEY,
            primary_key_value TEXT NOT NULL,
            company_name TEXT
        )
        """
    )
    cursor.execute("CREATE INDEX idx_company_map_key ON company_map(primary_key_value)")

    cols_def = ", ".join(fts5_columns)
    cursor.execute(
        f"""
        CREATE VIRTUAL TABLE company_fts USING fts5(
            {cols_def},
            tokenize='porter unicode61'
        )
        """
    )
    cursor.execute(
        f"""
        CREATE VIRTUAL TABLE company_exact_fts USING fts5(
            {cols_def},
            tokenize="unicode61 tokenchars '-&/'"
        )
        """
    )

    total = len(df)
    fts_qs = ", ".join(["?"] * (len(fts5_columns) + 1))
    progress_span = 70
    progress_base = 20

    for idx, (_, row) in enumerate(df.iterrows()):
        if (idx + 1) % 5000 == 0 or idx + 1 == total:
            percent = progress_base + int(((idx + 1) / max(1, total)) * progress_span)
            _emit(
                progress_callback,
                stage="building_index",
                percent=percent,
                message=f"Indexing company {idx + 1}/{total}",
                current=idx + 1,
                total=total,
            )

        primary_key_value = str(row[PRIMARY_KEY_COLUMN])
        company_name = str(row[COMPANY_NAME_COLUMN])
        rowid = idx + 1
        cursor.execute(
            "INSERT INTO company_map (id, primary_key_value, company_name) VALUES (?, ?, ?)",
            (rowid, primary_key_value, company_name),
        )

        col_texts = []
        for src_col in source_columns:
            val = row.get(src_col, "")
            if pd.isna(val):
                val = ""
            col_texts.append(str(val))

        cursor.execute(
            f"INSERT INTO company_fts(rowid, {cols_def}) VALUES ({fts_qs})",
            [rowid] + col_texts,
        )
        cursor.execute(
            f"INSERT INTO company_exact_fts(rowid, {cols_def}) VALUES ({fts_qs})",
            [rowid] + col_texts,
        )

    conn.commit()
    conn.close()


def build_index_bundle(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    progress_callback: Callable[[IndexBuildProgress], None] | None = None,
) -> IndexBuildResult:
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    config = load_scoring_config()

    _emit(
        progress_callback,
        stage="starting",
        percent=0,
        message=f"Preparing {input_path.name}",
    )

    if not input_path.exists():
        raise FileNotFoundError(f"Input workbook not found: {input_path}")

    _emit(
        progress_callback,
        stage="reading_excel",
        percent=10,
        message=f"Reading Excel file '{input_path.name}'",
    )
    df = pd.read_excel(input_path, engine="openpyxl")

    _emit(
        progress_callback,
        stage="validating_primary_key",
        percent=15,
        message=f"Validating '{PRIMARY_KEY_COLUMN}' and '{COMPANY_NAME_COLUMN}' columns",
    )
    validate_company_primary_key(df)

    _emit(
        progress_callback,
        stage="building_index",
        percent=20,
        message=f"Building company-level FTS5 index for {len(df)} companies",
        current=0,
        total=len(df),
    )
    db_path = output_dir / "search.db"
    build_sqlite_index(df, db_path, config, progress_callback=progress_callback)

    _emit(
        progress_callback,
        stage="writing_metadata",
        percent=88,
        message="Writing company metadata parquet",
    )
    for col in df.columns:
        if df[col].dtype == "object":
            df[col] = df[col].astype(pd.StringDtype())
    parquet_path = output_dir / "company_metadata.parquet"
    df.to_parquet(parquet_path, index=False)

    _emit(
        progress_callback,
        stage="writing_config",
        percent=94,
        message="Writing bundle config",
    )
    index_config = {
        "primary_key": PRIMARY_KEY_COLUMN,
        "company_name_col": COMPANY_NAME_COLUMN,
        "fts_table_name": "company_fts",
        "exact_fts_table_name": "company_exact_fts",
        "source_columns": config["source_columns"],
        "fts5_column_names": config["fts5_column_names"],
        "num_companies": len(df),
    }
    config_path = output_dir / "index_config.json"
    with config_path.open("w", encoding="utf-8") as f:
        json.dump(index_config, f, indent=2)

    _emit(
        progress_callback,
        stage="verifying_bundle",
        percent=98,
        message="Verifying bundle artifacts",
    )
    if not db_path.exists() or not parquet_path.exists() or not config_path.exists():
        raise RuntimeError("Bundle verification failed; one or more artifacts are missing.")

    _emit(
        progress_callback,
        stage="completed",
        percent=100,
        message=f"Index bundle built at {output_dir}",
    )
    return IndexBuildResult(
        input_path=str(input_path),
        output_dir=str(output_dir),
        db_path=str(db_path),
        parquet_path=str(parquet_path),
        config_path=str(config_path),
        primary_key=PRIMARY_KEY_COLUMN,
        company_name_col=COMPANY_NAME_COLUMN,
        fts_table_name="company_fts",
        exact_fts_table_name="company_exact_fts",
        num_companies=len(df),
    )
