# Company Screener

Company Screener is a local search stack for analyst-led company screening.
It builds a SQLite FTS5 index from an Excel workbook, then exposes that data
through:

- a Streamlit UI for interactive screening
- a FastAPI backend for search, export, history, lists, and index jobs

## Core Layout

The repo is organized around three active code paths:

- `build_index.py`
  CLI entrypoint for building an index bundle from an `.xlsx`
- `company_screener/`
  Shared indexing and search runtime used by both the UI and backend
- `backend/`
  FastAPI application with OpenAPI docs and async index-job endpoints

The Streamlit UI lives in:

- `search_app.py`
- `search_app_impl.py`

## What Gets Built

Running the index builder creates a bundle directory with:

- `search.db` - SQLite FTS5 index
- `company_metadata.parquet` - metadata rows for display/export
- `index_config.json` - bundle configuration

The current local default bundle name is `search_index_exact`.

## Quick Start

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Build the index from an Excel workbook:

```bash
python build_index.py --input master_companies.xlsx --output search_index_exact
```

3. Start the Streamlit UI:

```bash
python -m streamlit run search_app.py -- --index ./search_index_exact
```

4. Start the backend:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

Backend docs:

- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- ReDoc: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## Search Notes

- `Company` is the primary key used across the built index and metadata joins.
- Unquoted keywords use stemmed FTS matching.
- Quoted keywords use the unstemmed exact-search path.
- Boolean expressions operate on keyword serial numbers.

## Scoring Extension

The repo still includes `scoring_ext.c` and `scoring_ext.dll`. The current
runtime uses SQLite FTS5 `bm25(...)` for ranking, but the extension is kept
buildable for compatibility and experimentation.

To rebuild the DLL on Windows:

```bat
build_scoring.bat
```

That script uses the vendored SQLite 3.49.1 headers in `vendor/`.

## Generated Local State

Large bundles, runtime logs, temp databases, uploaded workbooks, and local user
state are intentionally ignored in `.gitignore` so the repo stays clean.

## Useful Docs

- [docs/README.md](/E:/company-screener/docs/README.md)
- [docs/REPO_STRUCTURE.md](/E:/company-screener/docs/REPO_STRUCTURE.md)
- [docs/SCORING.md](/E:/company-screener/docs/SCORING.md)
- [docs/REACT_IMPLEMENTATION_SPEC.md](/E:/company-screener/docs/REACT_IMPLEMENTATION_SPEC.md)
- [docs/AGENT_HANDOFF.md](/E:/company-screener/docs/AGENT_HANDOFF.md)
- [backend/README.md](/E:/company-screener/backend/README.md)
