"""
Company Screener - Index Builder (CLI wrapper)

This script remains the command-line entrypoint for building an index bundle
from an Excel workbook, while the actual implementation lives in
`company_screener.index_builder` so it can also be reused by the backend job
runner.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from company_screener.index_builder import build_index_bundle


def _print_progress(progress) -> None:  # type: ignore[no-untyped-def]
    current = f" {progress.current}/{progress.total}" if progress.current is not None and progress.total is not None else ""
    print(f"[{progress.percent:>3}%] {progress.stage}: {progress.message}{current}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build search index from an Excel workbook")
    parser.add_argument("--input", default="master_companies.xlsx", help="Path to source .xlsx workbook")
    parser.add_argument("--output", default="search_index_exact", help="Output directory for index bundle")
    args = parser.parse_args()

    started = time.time()
    result = build_index_bundle(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        progress_callback=_print_progress,
    )
    elapsed = time.time() - started

    print("")
    print(f"Done in {elapsed:.1f}s")
    print(f"Input: {result.input_path}")
    print(f"Output: {result.output_dir}")
    print(f"Companies indexed: {result.num_companies:,}")
    print(f"Database: {result.db_path}")
    print(f"Metadata: {result.parquet_path}")
    print(f"Config: {result.config_path}")


if __name__ == "__main__":
    main()
