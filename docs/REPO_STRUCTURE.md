# Repository Structure

This document is the practical map of the `company-screener` repo.
It is meant to help a new engineer or coding agent understand:

- what belongs where
- which files are source versus generated state
- how the Streamlit UI and FastAPI backend share logic
- where to put new work without increasing sprawl

## Top-Level Layout

```text
E:\company-screener
|-- backend/                 FastAPI app, schemas, routers, services, tests
|-- company_screener/        Shared Python package for indexing and search runtime
|-- docs/                    Project documentation and audits
|-- lists/                   Local user-created list JSON files
|-- search_index/            Older local index bundle
|-- search_index_exact/      Current default local index bundle
|-- vendor/                  Vendored build-only dependencies (SQLite headers)
|-- build_index.py           CLI wrapper around shared index builder
|-- build_index.bat          Windows helper for index build
|-- build_scoring.bat        Windows helper for rebuilding scoring_ext.dll
|-- generate_sample.py       Generates a sample workbook
|-- scoring_config.json      Source weights and scoring config
|-- scoring_ext.c            SQLite extension source
|-- scoring_ext.dll          Compiled SQLite extension
|-- search_app.py            Thin Streamlit entrypoint
|-- search_app_impl.py       Main Streamlit UI implementation
|-- start_app.bat            Windows helper for launching Streamlit
|-- requirements.txt         Root Python dependencies for local app usage
|-- README.md                Short project overview
```

## Ownership Boundaries

### `company_screener/`

This is the shared core.

Use it for:

- index building
- boolean parser logic
- keyword normalization
- highlight generation
- shared search/runtime behavior used by multiple frontends

Important files:

- [index_builder.py](/E:/company-screener/company_screener/index_builder.py)
- [runtime.py](/E:/company-screener/company_screener/engine/runtime.py)
- [parser.py](/E:/company-screener/company_screener/engine/parser.py)
- [keyword_utils.py](/E:/company-screener/company_screener/engine/keyword_utils.py)
- [highlighter.py](/E:/company-screener/company_screener/engine/highlighter.py)

Rule:

- If both Streamlit and FastAPI need the behavior, it belongs here first.

### `backend/`

This is the FastAPI service layer.

Use it for:

- HTTP routing
- request/response schemas
- job orchestration
- persistence adapters
- API-only features like index jobs, exports, history endpoints, list endpoints

Important subfolders:

- [app/routers](/E:/company-screener/backend/app/routers)
- [app/services](/E:/company-screener/backend/app/services)
- [app/schemas](/E:/company-screener/backend/app/schemas)
- [app/storage](/E:/company-screener/backend/app/storage)
- [app/workers](/E:/company-screener/backend/app/workers)
- [tests](/E:/company-screener/backend/tests)

Rule:

- Routers should stay thin.
- Business logic belongs in services.
- File persistence or repository logic belongs in storage.

### `search_app_impl.py`

This is the Streamlit UI layer.

Use it for:

- widget layout
- session state
- formatting and display logic
- user-facing interaction flow

Rule:

- Do not let core search logic drift here if it can live in
  `company_screener/engine/`.

## Generated and Local-Only State

These are real runtime artifacts, but they are not source code:

- `search_index/`
- `search_index_exact/`
- `lists/`
- `search_history.json`
- `index_bundles/`
- `index_jobs/`
- `index_uploads/`
- `active_index_bundle.json`

They are ignored via [.gitignore](/E:/company-screener/.gitignore).

Rule:

- Keep useful local bundles on disk if they help development.
- Do not treat them as canonical source.
- Never place source code inside generated bundle folders.

## Documentation Layout

The `docs/` folder is the home for:

- architecture references
- UI implementation notes
- scoring notes
- historical audits
- agent handoff documentation

Rule:

- New durable documentation belongs in `docs/`.
- Keep the root README short and navigational.

## Build and Run Paths

### Build an index

```bash
python build_index.py --input master_companies.xlsx --output search_index_exact
```

### Run Streamlit

```bash
python -m streamlit run search_app.py -- --index ./search_index_exact
```

### Run backend

```bash
cd backend
python -m uvicorn app.main:app --reload
```

### Run tests

```bash
cd backend
python -m pytest
```

## Current Search Reality

The historical C extension is still buildable, but the current live search
runtime defaults to SQLite FTS5 `bm25(...)` ranking.

That means:

- [scoring_ext.c](/E:/company-screener/scoring_ext.c) is still important
- [scoring_ext.dll](/E:/company-screener/scoring_ext.dll) should still compile
- but behavioral parity should be checked against the current runtime in
  [runtime.py](/E:/company-screener/company_screener/engine/runtime.py) and
  [search_app_impl.py](/E:/company-screener/search_app_impl.py), not only
  against the older scoring doc

## What To Clean Up Versus What To Keep

Safe to remove when stale:

- temp `.db` files
- logs
- `__pycache__`
- `.pytest_cache`
- duplicated worktrees
- abandoned scratch files

Keep intentionally:

- `search_index_exact/` if it is your active local dataset
- `vendor/sqlite-amalgamation-3490100/` because it makes DLL rebuilds reproducible
- `docs/` because it is now the documentation home

## Where New Work Should Go

### Add a new API endpoint

1. Add a schema in `backend/app/schemas/`
2. Add logic in `backend/app/services/`
3. Add storage helper in `backend/app/storage/` if needed
4. Add router wiring in `backend/app/routers/`
5. Add tests in `backend/tests/`

### Add search behavior used by both UI and backend

1. Implement in `company_screener/engine/`
2. Update backend service usage
3. Update Streamlit usage if needed
4. Add tests or verification

### Add UI-only behavior

1. Implement in `search_app_impl.py`
2. Keep formatting helpers local unless reused elsewhere

## Maintenance Rules

- Prefer one shared implementation over parallel backend/UI copies.
- Keep root-level files few and obvious.
- Keep generated state ignored.
- Update docs when changing defaults such as bundle name, PK, or scoring mode.
- If a batch script depends on a local toolchain, make the dependency explicit
  and reproducible.
