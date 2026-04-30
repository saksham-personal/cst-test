# Company Screener Backend

FastAPI backend for the Company Screener application.

The backend shares the same search runtime as the Streamlit UI, so Swagger and the API both describe the same search, list, history, keyword, and export behavior.

## Swagger / OpenAPI

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

The API is grouped into these tags:

- `meta` for health, config, and capability metadata
- `search` for executing searches and paging cached results
- `keywords` for parsing imports and validating expressions
- `lists` for saved company list CRUD
- `history` for recent search history
- `exports` for CSV/XLSX downloads
- `index-jobs` for asynchronous workbook-to-index builds and bundle activation
- `index-jobs` for asynchronous Excel-to-index bundle builds

## Endpoint Overview

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/meta/health` | Lightweight health check |
| `GET` | `/api/v1/meta` | Backend and index metadata |
| `GET` | `/api/v1/meta/config` | Runtime configuration |
| `GET` | `/api/v1/meta/capabilities` | Active search bundle capabilities |
| `POST` | `/api/v1/search/execute` | Run a search and return the first page |
| `GET` | `/api/v1/search/{search_id}` | Convenience alias for cached paging |
| `GET` | `/api/v1/search/{search_id}/page` | Fetch a cached result page |
| `GET` | `/api/v1/search/{search_id}/highlights` | Fetch a page with highlights enabled |
| `POST` | `/api/v1/keywords/parse` | Parse pasted keyword text or CSV |
| `POST` | `/api/v1/keywords/validate` | Validate a boolean expression |
| `GET` | `/api/v1/keywords/template` | Download the keyword CSV template |
| `GET` | `/api/v1/lists` | List saved company lists |
| `POST` | `/api/v1/lists` | Create a list |
| `GET` | `/api/v1/lists/{list_name}` | Fetch one saved list |
| `DELETE` | `/api/v1/lists/{list_name}` | Delete a list |
| `POST` | `/api/v1/lists/{list_name}/companies` | Add companies to a list |
| `POST` | `/api/v1/lists/{list_name}/copy` | Copy selected companies into another saved list |
| `DELETE` | `/api/v1/lists/{list_name}/companies` | Remove companies from a list |
| `DELETE` | `/api/v1/lists/{list_name}/companies/{company_name}` | Remove one company from a list |
| `GET` | `/api/v1/history` | List recent searches |
| `POST` | `/api/v1/history` | Record a search history entry |
| `DELETE` | `/api/v1/history` | Clear search history |
| `POST` | `/api/v1/exports/search/{search_id}` | Download a cached search as CSV/XLSX |
| `POST` | `/api/v1/exports/lists/{list_name}` | Download a saved list as CSV/XLSX |
| `GET` | `/api/v1/index-jobs` | List async index build jobs |
| `POST` | `/api/v1/index-jobs` | Queue a build from a local workbook path |
| `POST` | `/api/v1/index-jobs/upload` | Queue a build from an uploaded workbook |
| `GET` | `/api/v1/index-jobs/{job_id}` | Inspect one index build job |
| `POST` | `/api/v1/index-jobs/{job_id}/activate` | Activate a completed bundle |
| `GET` | `/api/v1/index-jobs` | List persisted index build jobs |
| `POST` | `/api/v1/index-jobs` | Start an index build from a local `.xlsx` path |
| `POST` | `/api/v1/index-jobs/upload` | Upload a `.xlsx` file and start an index build |
| `GET` | `/api/v1/index-jobs/{job_id}` | Inspect live job progress and status |
| `POST` | `/api/v1/index-jobs/{job_id}/activate` | Activate a completed bundle |

## Search Contract

Search requests use ordered keyword rows and optional boolean expressions:

- If `query_expression` is blank, the backend uses the default soft-AND mode.
- If `query_expression` is present, the expression controls the final result set.
- Quoted keywords are treated as exact searches in the documented exact-FTS path.
- `serial` values are user-defined and preserved for CSV imports.

History entries preserve the full replay state needed to reload a prior search:

- `keywords`
- `query_expression`
- `parsed_query`
- `page` and `page_size`
- `include_highlights` and `include_metadata`
- `timings_ms`

That lets the frontend repopulate the query editor, show the parsed expression, and reopen the same result view without guessing.

## Index Build Jobs

Index builds run asynchronously in a subprocess so the API stays responsive.

Supported request shapes:

- local path builds through `POST /api/v1/index-jobs`
- file upload builds through `POST /api/v1/index-jobs/upload`

Progress is persisted per job and can be polled from `GET /api/v1/index-jobs/{job_id}`.
Each job tracks stages such as workbook validation, Excel read, SQLite build, Parquet write, config write, bundle verification, completion, and activation.

Typical response fields:

- `state`
- `stage`
- `percent`
- `message`
- `current`
- `total`
- `eta_seconds`
- `bundle_ready`
- `timings_ms`

Activation is explicit unless `activate_on_success` is set on create/upload.
- Search responses include optional `cache_hit` and `timings_ms` metadata for richer frontend status UI.
- History entries persist `keywords`, `query_expression`, `parsed_query`, and `search_mode`, so the frontend can fully reload a prior query state.

Example request:

```json
{
  "keywords": [
    {"serial": 1, "keyword": "manufacturer", "mode": "lexical", "action": "include", "weight": 1},
    {"serial": 2, "keyword": "\"managed services\"", "mode": "lexical", "action": "include", "weight": 1}
  ],
  "query_expression": "1 OR 2",
  "page": 1,
  "page_size": 25,
  "include_highlights": true,
  "include_metadata": true
}
```

## Running Locally

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

## Environment

Copy `.env.example` to `.env` if you want to override defaults.

## Tests

```powershell
cd backend
python -m pytest
```
