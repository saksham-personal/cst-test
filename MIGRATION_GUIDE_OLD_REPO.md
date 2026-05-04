# Migration Guide: Moving the New Screening Pipeline Into the Older Local Repo

This guide is for integrating this repo’s newer screening workflow into an older local repo that has a slightly different keyword-searching UI while keeping a mostly similar backend/search engine. It covers where to start, what database schema to build, what maps to what, and how each frontend component should connect to backend services.

## 1. Start Here: Migration Strategy

### 1.1 Recommended order

Do not start by copying UI components randomly. Start from the persisted data model and backend contracts, then connect pages one workflow step at a time.

1. **Search/index compatibility first**: confirm the old repo can build and load the same index bundle shape used by [`SearchEngine`](company_screener/engine/runtime.py:166).
2. **Database schema second**: add the screening and list tables before importing any new UI.
3. **Backend routers/services third**: expose stable API contracts in the old repo.
4. **Frontend API layer fourth**: add endpoint wrappers equivalent to [`endpoints.ts`](frontend/src/api/endpoints.ts).
5. **Page-by-page UI migration fifth**: migrate screens in pipeline order, not by visual complexity.
6. **LLM screening last**: it depends on screenings, final criteria, lists, and prompt generation.

### 1.2 Why start with backend/schema

- The new UI is stateful and resumable; browser state is only a cache.
- Criteria Analysis, Lists, LLM Screening, and Output Compilation all depend on `screening_id` and active-screen state.
- If the schema is missing, the imported UI will look correct but lose progress after refresh.

### 1.3 Minimum viable migration slice

If you need a safe first milestone, implement only this slice first:

1. Screening upload/start/active screen.
2. Criteria Analysis resume/reset/final-criteria persistence.
3. Keyword generation into the old repo’s existing search UI.
4. Add search results to screen-associated lists.

After that, migrate LLM Screening and Output Compilation.

## 2. Keep vs Replace

### 2.1 Keep from the old repo

- The old keyword search UI if users already rely on it.
- Existing search index runtime if it accepts the same request/response shape.
- Existing backend search execution if it can return `primary_key_value`, company name, matched keywords, metadata, and a cached `search_id`.

### 2.2 Replace or add from this repo

- Screening intake and duplicate handling.
- Active-screen state and green active-screen bar behavior.
- Criteria Analysis state machine and persisted final criteria.
- List association with `screening_id` and Screen Name.
- LLM Screening prompt generation and final-list workflow.
- Output compilation around final lists.

### 2.3 Do not migrate stale docs/routes

- Do not revive removed Streamlit paths or old references to `search_app.py`, `search_app_impl.py`, or `vendor/`.
- Treat the live architecture as React/Vite frontend plus FastAPI backend.

## 3. Target Backend Architecture

### 3.1 Service layout to mirror

Use these modules as the target architecture:

| Concern | Target file | Responsibility |
|---|---|---|
| App creation | [`main.py`](backend/app/main.py) | Create services once and register routers. |
| Dependencies | [`dependencies.py`](backend/app/core/dependencies.py) | Expose service getters to routers. |
| Settings | [`config.py`](backend/app/core/config.py) | Configure paths for index, lists, screenings, documents. |
| Search service | [`search.py`](backend/app/services/search.py) | Execute searches and cache result sets. |
| Shared engine | [`company_screener/`](company_screener/) | Keep search/index behavior outside routers. |
| Screening service | [`screenings.py`](backend/app/services/screenings.py) | Screening intake, active screen, pipeline state, final criteria. |
| Lists service | [`lists.py`](backend/app/services/lists.py) | Saved lists and companies. |
| Criteria router | [`criteria_analysis.py`](backend/app/routers/criteria_analysis.py) | Thin route layer for criteria workflow. |
| LLM router | [`llm_screening.py`](backend/app/routers/llm_screening.py) | Prompt generation and future LLM jobs. |

### 3.2 Rule for old repo backend logic

- Put shared search/index logic in a reusable package like [`company_screener/`](company_screener/), not inside frontend routes or page code.
- Keep FastAPI routers thin: validation, dependency injection, service call, response.
- Put any durable workflow changes in services/repositories, not components.

## 4. Required Settings and Storage Paths

Add these settings to the old repo’s config if missing. The current implementation defines them in [`Settings`](backend/app/core/config.py:76).

| Setting | Purpose | Default pattern |
|---|---|---|
| `index_dir` | Active search index bundle path | repo `search_index_exact` or `search_index` |
| `lists_dir` | Saved-list database directory | repo `lists/` |
| `screenings_dir` | Screening data root | repo `screenings/` |
| `screenings_db_path` | Screening SQLite DB path | repo `screenings/screenings.db` |
| `screening_documents_dir` | Canonical uploaded PDFs | repo `screenings/documents/` |
| `search_history_path` | Search history JSON | repo `search_history.json` |
| `active_index_state_path` | Active index bundle state | repo `active_index_bundle.json` |
| `search_cache_max_entries` | Search result cache size | integer |
| `search_cache_ttl_seconds` | Search result cache TTL | integer seconds |

## 5. Database Schema to Build

The old repo should add two immediate SQLite databases:

1. [`screenings.db`](backend/app/storage/screenings_repo.py:33) under `screenings/`.
2. [`lists.db`](backend/app/storage/lists_repo.py:44) under `lists/`.

For LLM Screening integration, add a third durable DB/table set either inside `screenings.db` or a new `llm_screening.db`. Prefer `screenings.db` if run records are tightly tied to screens.

## 6. Screening Database Schema

### 6.1 Table: `screening_documents`

Source implementation: [`screenings_repo.py`](backend/app/storage/screenings_repo.py:43).

Purpose: one canonical document per PDF hash. Multiple screening rows can reuse the same document.

```sql
CREATE TABLE IF NOT EXISTS screening_documents (
    id TEXT PRIMARY KEY,
    pdf_sha256 TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT,
    extraction_status TEXT NOT NULL,
    raw_extraction_payload_json TEXT NOT NULL,
    extraction_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### Column mapping

| Column | Frontend/API field | Meaning |
|---|---|---|
| `id` | `document_id` | Stable document id. |
| `pdf_sha256` | `pdf_sha256` | Deduplication key. |
| `original_filename` | `original_filename` | Display fallback. |
| `storage_path` | PDF route source | Canonical file path. |
| `file_size_bytes` | `file_size_bytes` | Upload metadata. |
| `mime_type` | `mime_type` | Upload metadata. |
| `extraction_status` | internal | Parser status. |
| `raw_extraction_payload_json` | extraction payload | Raw PDF parser output. |
| `extraction_version` | internal | Parser version marker. |
| `created_at` / `updated_at` | display/sort | Timestamps. |

### 6.2 Table: `screenings`

Source implementation: [`screenings_repo.py`](backend/app/storage/screenings_repo.py:60).

Purpose: user-specific screening workflow instance. This is the central table for active screen, Criteria Analysis, LLM Screening, and output state.

```sql
CREATE TABLE IF NOT EXISTS screenings (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    status TEXT NOT NULL,
    screen_name TEXT,
    website TEXT,
    inbound_date TEXT,
    target_date TEXT,
    targets_found INTEGER,
    output_file TEXT,
    extracted_fields_json TEXT NOT NULL,
    edited_fields_json TEXT NOT NULL,
    pipeline_step INTEGER NOT NULL DEFAULT 1,
    pipeline_status TEXT NOT NULL DEFAULT 'FORM_UPLOADED',
    is_active INTEGER NOT NULL DEFAULT 0,
    llm_request_json TEXT,
    llm_response_json TEXT,
    curr_final_criteria TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES screening_documents(id) ON DELETE CASCADE
);
```

#### Required indexes

```sql
CREATE INDEX IF NOT EXISTS ix_screenings_document_id ON screenings(document_id);
CREATE INDEX IF NOT EXISTS ix_screenings_updated_at ON screenings(updated_at);
```

#### Column mapping

| Column | Frontend/API field | Used by | Notes |
|---|---|---|---|
| `id` | `screening_id`, `id` | all workflow pages | Primary screen id. |
| `document_id` | `document_id` | intake/detail | Links to PDF document. |
| `status` | `status` | screen store, UI badges | `draft` or `screening_started`. |
| `screen_name` | `screen_name`, Screen Name | active bar, dropdowns, lists | Preferred display label. |
| `website` | `website` | screening detail | Optional metadata. |
| `inbound_date` | `inbound_date` | screen store | Incoming date. |
| `target_date` | `target_date` | screen store | Deadline/date display. |
| `targets_found` | `targets_found` | output/detail | Optional count. |
| `output_file` | `output_file` | output compilation | Optional export path. |
| `extracted_fields_json` | `extracted_fields` | detail page | Initial parser values. |
| `edited_fields_json` | `edited_fields` | detail page/criteria | User-edited normalized fields. |
| `pipeline_step` | `pipeline_step` | resume logic | Numeric stage. |
| `pipeline_status` | `pipeline_status` | active bar/resume | String stage. |
| `is_active` | `is_active` | green bar/default filters | Only one should be active. |
| `llm_request_json` | internal | audit | Stub/real LLM request payload. |
| `llm_response_json` | internal | audit | Stub/real LLM response payload. |
| `curr_final_criteria` | `curr_final_criteria` | Criteria Analysis, prompt gen | Persisted final criteria markdown. |
| `created_at` / `updated_at` | display/sort | lists/selectors | Timestamps. |

### 6.3 Pipeline step/status mapping

Source constants: [`ScreeningsService`](backend/app/services/screenings.py:31).

| Step | Status | Meaning | UI route |
|---:|---|---|---|
| 1 | `FORM_UPLOADED` | PDF uploaded/draft intake | `/screenings/:id` |
| 2 | `AWAITING_LLM_QA` | Screening started; Criteria Analysis can begin | `/criteria-analysis/:id` |
| 3 | `USER_QA_PENDING` | Questions visible/in progress | `/criteria-analysis/:id` |
| 4 | `GENERATING_CRITERIA` | Final criteria generation/final visible | `/criteria-analysis/:id` |
| 5 | `KEYWORD_SEARCH` | Ready for keyword search | `/search` |
| 6 | `LLM_SCREENING` | Real LLM screening run started | `/llm-screening` |
| 7 | `OUTPUT_COMPILATION` | Final list/output stage | `/output-compilation` |
| 8 | `COMPLETED` | Finished workflow | output/archive |

The old repo may only have steps 1-5 now; add 6-8 when real LLM run/output persistence is added.

### 6.4 Normalized screening field map

Source map: [`ScreeningsService.RAW_TO_NORMALIZED`](backend/app/services/screenings.py:44).

| Raw PDF label | Normalized key |
|---|---|
| `Type` | `type` |
| `Name` | `name` |
| `HQ` | `hq` |
| `Sponsor name` | `sponsor_name` |
| `Sponsor Relationship` | `sponsor_relationship` |
| `Screening Request Name` | `screening_request_name` |
| `Submitter Name` | `submitter_name` |
| `Submitter SID` | `submitter_sid` |
| `Senior Client Exec(s)` | `senior_client_execs` |
| `Target Sector` | `target_sector` |
| `Target Revenue` | `target_revenue` |
| `Target EBITDA` | `target_ebitda` |
| `Investment Criteria` | `investment_criteria` |
| `Geographical Focus` | `geographical_focus` |

Important rule: frontend PATCH requests must update normalized keys only. Do not accept raw PDF labels in patch payloads.

## 7. Lists Database Schema

Source implementation: [`lists_repo.py`](backend/app/storage/lists_repo.py:40).

### 7.1 Table: `saved_lists`

Purpose: named company lists, optionally associated with a screen.

```sql
CREATE TABLE IF NOT EXISTS saved_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    screening_id TEXT,
    screen_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Column mapping

| Column | Frontend/API field | Meaning |
|---|---|---|
| `id` | internal | List primary key. |
| `name` | `name`, `listName` | User-visible list name. |
| `screening_id` | `screening_id` | Optional owning/associated screen. |
| `screen_name` | `screen_name` | Display copy of Screen Name. |
| `created_at` / `updated_at` | display/sort | Timestamps. |

### 7.2 Table: `list_companies`

Purpose: companies in each saved list. The primary identity is the index primary key, not just company name.

```sql
CREATE TABLE IF NOT EXISTS list_companies (
    list_id INTEGER,
    primary_key_value TEXT NOT NULL,
    company_name TEXT,
    crescendo_id TEXT,
    source_keywords TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, primary_key_value),
    FOREIGN KEY (list_id) REFERENCES saved_lists(id) ON DELETE CASCADE
);
```

#### Column mapping

| Column | Frontend/API field | Meaning |
|---|---|---|
| `list_id` | internal | FK to `saved_lists`. |
| `primary_key_value` | `primary_key_value` | Stable company id from search index. |
| `company_name` | `company` | Display company name. |
| `crescendo_id` | `crescendo_id` | Explicit Crescendo id; fallback to primary key. |
| `source_keywords` | `source_keywords` | JSON array of keyword/source labels. |
| `added_at` | `added_at` | Timestamp. |

### 7.3 Recommended list extension for LLM results

The current schema can store company membership, but final lists need LLM decision/rationale metadata. Add either extra columns to `list_companies` or a separate table.

Preferred non-breaking extension:

```sql
CREATE TABLE IF NOT EXISTS list_company_metadata (
    list_id INTEGER NOT NULL,
    primary_key_value TEXT NOT NULL,
    source_list_name TEXT,
    llm_run_id TEXT,
    llm_decision TEXT,
    llm_rationale TEXT,
    llm_status TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (list_id, primary_key_value),
    FOREIGN KEY (list_id, primary_key_value)
        REFERENCES list_companies(list_id, primary_key_value)
        ON DELETE CASCADE
);
```

This avoids breaking older list code while letting final exports include LLM output.

## 8. LLM Screening Run Schema to Add

The current [`llm_screening.py`](backend/app/routers/llm_screening.py) has stub job routes. For the old repo integration, add durable run storage.

### 8.1 Table: `llm_screening_runs`

```sql
CREATE TABLE IF NOT EXISTS llm_screening_runs (
    id TEXT PRIMARY KEY,
    screening_id TEXT,
    source_list_name TEXT NOT NULL,
    final_list_name TEXT,
    model TEXT,
    batch_size INTEGER NOT NULL DEFAULT 20,
    rationale_enabled INTEGER NOT NULL DEFAULT 1,
    prompts_json TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    yes_count INTEGER NOT NULL DEFAULT 0,
    no_count INTEGER NOT NULL DEFAULT 0,
    maybe_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    request_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE SET NULL
);
```

### 8.2 Table: `llm_screening_results`

```sql
CREATE TABLE IF NOT EXISTS llm_screening_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    screening_id TEXT,
    source_list_name TEXT NOT NULL,
    primary_key_value TEXT NOT NULL,
    company_name TEXT,
    website TEXT,
    decision TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    raw_response_json TEXT,
    selected_for_final INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES llm_screening_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE SET NULL
);
```

### 8.3 LLM run status values

Use a small fixed set:

| Status | Meaning |
|---|---|
| `queued` | Created but not started. |
| `running` | Processing batches. |
| `paused` | User paused/stopped run. |
| `completed` | All rows processed. |
| `completed_with_errors` | Done but at least one row errored. |
| `failed` | Run-level failure. |
| `cancelled` | User cancelled. |

### 8.4 LLM result decision values

Keep the UI bucket values stable:

| Decision | UI bucket |
|---|---|
| `Yes` | green bucket |
| `No` | red bucket |
| `Maybe` | amber bucket |
| `Error` | error bucket |

## 9. Search Index Database Expectations

The backend search engine expects an index bundle, not application workflow tables. Keep this separate from `screenings.db` and `lists.db`.

### 9.1 Required index bundle files

The runtime loads:

- `index_config.json`
- `company_metadata.parquet`
- `search.db`

### 9.2 Required `search.db` structures

Based on [`SearchEngine`](company_screener/engine/runtime.py:166), the index DB should include:

| Table/view | Required columns | Purpose |
|---|---|---|
| `company_map` | `id`, one of `primary_key_value`, configured primary key, `company_name`, or `crescendo_id` | Maps FTS row ids to company primary keys. |
| configured FTS table, default `company_fts` | FTS5 columns from source config | Lexical keyword search. |
| configured exact FTS table, default `company_exact_fts` | FTS5 columns from source config | Quoted/exact searches if available. |

### 9.3 Required `index_config.json` keys

| Key | Purpose |
|---|---|
| `primary_key` | Column used as stable company id. |
| `company_name_col` | Display company-name column. |
| `fts_table_name` | FTS table name, usually `company_fts`. |
| `exact_fts_table_name` | Exact FTS table name, usually `company_exact_fts`. |

### 9.4 Search response contract to preserve in old UI

Even if the old keyword UI is visually different, make it produce and consume the same backend contract:

| Field | Meaning |
|---|---|
| `search_id` | Cached search id for paging and server-side add-to-list. |
| `query_expression` | Boolean expression over keyword serials. |
| `results[].primary_key_value` | Company stable id. |
| `results[].company_name` | Display name. |
| `results[].matched_keywords` | Matched keyword text. |
| `results[].matched_serials` | Matched serials for UI chips. |
| `results[].metadata` | Company metadata used by detail drawer/exports. |
| `keyword_hit_counts` | Keyword counts for UI feedback. |

## 10. Backend Endpoint Map

### 10.1 Screenings endpoints

Implement these in the old repo if missing:

| Method | Path | Frontend helper | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/screenings/intake` | [`uploadScreeningIntake()`](frontend/src/api/endpoints.ts) | Upload PDF, dedupe, create screening. |
| `POST` | `/api/v1/screenings/intake/duplicate-create` | [`createDuplicateScreening()`](frontend/src/api/endpoints.ts) | Clone screening from existing document. |
| `GET` | `/api/v1/screenings` | [`listScreenings()`](frontend/src/api/endpoints.ts) | Populate screen dropdowns. |
| `GET` | `/api/v1/screenings/active` | [`getActiveScreening()`](frontend/src/api/endpoints.ts) | Hydrate active screen. |
| `GET` | `/api/v1/screenings/{id}` | [`getScreeningDetail()`](frontend/src/api/endpoints.ts) | Detail page and store hydration. |
| `PATCH` | `/api/v1/screenings/{id}/fields` | [`patchScreeningFields()`](frontend/src/api/endpoints.ts) | Merge field edits. |
| `GET` | `/api/v1/screenings/{id}/pdf` | [`getScreeningPdfUrl()`](frontend/src/api/endpoints.ts) | PDF preview. |
| `POST` | `/api/v1/screenings/{id}/start` | [`startScreening()`](frontend/src/api/endpoints.ts) | Activate screen and enter criteria pipeline. |

### 10.2 Criteria Analysis endpoints

| Method | Path | Frontend helper | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/criteria-analysis/analyze` | [`analyzeCriteria()`](frontend/src/api/endpoints.ts) | Load/resume initial criteria state. |
| `POST` | `/api/v1/criteria-analysis/progress` | [`markCriteriaProgress()`](frontend/src/api/endpoints.ts) | Persist current criteria stage. |
| `POST` | `/api/v1/criteria-analysis/refine` | [`refineCriteria()`](frontend/src/api/endpoints.ts) | Generate/save final criteria. |
| `POST` | `/api/v1/criteria-analysis/rerun` | [`rerunCriteriaAnalysis()`](frontend/src/api/endpoints.ts) | Reset criteria state from scratch. |

### 10.3 Search endpoints

| Method | Path | Frontend helper | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/search/execute` | [`executeSearch()`](frontend/src/api/endpoints.ts) | Run first page and cache results. |
| `POST` | `/api/v1/search/{search_id}/page` | [`searchPage()`](frontend/src/api/endpoints.ts) | Server-side sort/filter/page. |
| `GET` | `/api/v1/search/{search_id}/page` | [`getSearchPage()`](frontend/src/api/endpoints.ts) | Basic page retrieval. |

### 10.4 Lists endpoints

| Method | Path | Frontend helper | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/lists` | [`getLists()`](frontend/src/api/endpoints.ts) | List summaries, optionally by screen filter. |
| `POST` | `/api/v1/lists` | [`createList()`](frontend/src/api/endpoints.ts) | Create named list with optional screen. |
| `GET` | `/api/v1/lists/{name}` | [`getListDetail()`](frontend/src/api/endpoints.ts) | Get companies in list. |
| `POST` | `/api/v1/lists/{name}/companies` | [`addCompaniesToList()`](frontend/src/api/endpoints.ts) | Add selected rows. |
| `POST` | `/api/v1/lists/{name}/companies-from-search` | [`addCompaniesFromSearchToList()`](frontend/src/api/endpoints.ts) | Server-side cached search add. |
| `DELETE` | `/api/v1/lists/{name}/companies` | [`removeCompaniesFromList()`](frontend/src/api/endpoints.ts) | Remove selected rows. |
| `DELETE` | `/api/v1/lists/{name}` | [`deleteList()`](frontend/src/api/endpoints.ts) | Delete list. |

### 10.5 LLM Screening endpoints

Current stubs exist in [`llm_screening.py`](backend/app/routers/llm_screening.py). Expand to this shape:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/llm-screening/generate-prompts` | Generate prompts from `curr_final_criteria`. |
| `POST` | `/api/v1/llm-screening/runs` | Create/start a durable LLM screening run. |
| `GET` | `/api/v1/llm-screening/runs/{run_id}` | Fetch run status/counts/progress. |
| `GET` | `/api/v1/llm-screening/runs/{run_id}/results` | Fetch result rows for grid. |
| `POST` | `/api/v1/llm-screening/runs/{run_id}/pause` | Pause run. |
| `POST` | `/api/v1/llm-screening/runs/{run_id}/resume` | Resume run. |
| `POST` | `/api/v1/llm-screening/runs/{run_id}/rerun-errors` | Rerun error rows. |
| `POST` | `/api/v1/llm-screening/runs/{run_id}/final-list` | Add selected result rows to final list. |

## 11. Frontend Component Migration Map

### 11.1 App shell and routes

| New file/component | Old repo mapping | Notes |
|---|---|---|
| [`App.tsx`](frontend/src/App.tsx) | app router | Add routes for screenings, criteria, lists, LLM screening, output. |
| [`ActiveScreenBar.tsx`](frontend/src/components/layout/ActiveScreenBar.tsx) | global layout/header | Shows active screen and exit action. |
| [`PageHeader.tsx`](frontend/src/components/layout/PageHeader.tsx) | page title/header | Shared header actions. |
| [`screenStore.ts`](frontend/src/stores/screenStore.ts) | global state | Hydrate from backend active screen. |

### 11.2 Screening intake/detail components

| Component | Backend dependency | Data in/out |
|---|---|---|
| [`ScreeningIntakePage.tsx`](frontend/src/pages/ScreeningIntakePage.tsx) | `/screenings/intake` | File upload -> `ScreeningIntakeResponse`. |
| [`UploadPdfCard.tsx`](frontend/src/components/screenings/UploadPdfCard.tsx) | upload helper | PDF file + progress. |
| [`ScreeningDuplicateDialog.tsx`](frontend/src/components/screenings/ScreeningDuplicateDialog.tsx) | duplicate-create endpoint | Existing screenings -> selected screening or clone. |
| [`ScreeningDetailPage.tsx`](frontend/src/pages/ScreeningDetailPage.tsx) | detail/patch/start/pdf endpoints | Edit fields, start screening. |
| [`ScreeningFieldGrid.tsx`](frontend/src/components/screenings/ScreeningFieldGrid.tsx) | patch fields | Normalized field values. |
| [`EditableFieldCard.tsx`](frontend/src/components/screenings/EditableFieldCard.tsx) | patch fields | Single field edit UI. |
| [`ScreeningPdfPreview.tsx`](frontend/src/components/screenings/ScreeningPdfPreview.tsx) | PDF URL endpoint | PDF preview iframe/object. |

### 11.3 Criteria Analysis components

| Component | Backend dependency | Data in/out |
|---|---|---|
| [`CriteriaAnalysisPage.tsx`](frontend/src/pages/CriteriaAnalysisPage.tsx) | criteria endpoints | Resume, questions, final criteria, repeat reset. |
| Criteria accordions | `pipeline_step`, `curr_final_criteria` | Show last persisted stage. |
| Repeat dialog | rerun endpoint | Clears final criteria and resets step. |
| Generate Keywords button | search store/route state | Pass keywords and expression to search UI. |

### 11.4 Keyword Search UI

If the old keyword UI is only slightly different, keep it and adapt the data contract instead of replacing it.

| New contract | Old UI should map to |
|---|---|
| `KeywordInput.serial` | keyword row number. |
| `KeywordInput.keyword` | keyword text. |
| `KeywordInput.mode` | lexical/semantic selector; default lexical. |
| `KeywordInput.action` | include/exclude. |
| `KeywordInput.weight` | scoring weight. |
| `query_expression` | boolean expression input. |
| `SearchResultRow.primary_key_value` | row id used for list membership. |
| `SearchResultRow.company_name` | visible company name. |
| `SearchResultRow.metadata` | detail drawer/export fields. |

Frontend pieces in this repo that can be reused or mapped:

| Component/store | Role |
|---|---|
| [`SearchPage.tsx`](frontend/src/pages/SearchPage.tsx) | Full search page if replacing old UI. |
| [`KeywordBuilder.tsx`](frontend/src/components/search/KeywordBuilder.tsx) | Keyword rows. |
| [`QueryBox.tsx`](frontend/src/components/search/QueryBox.tsx) | Boolean query expression. |
| [`ResultsGrid.tsx`](frontend/src/components/search/ResultsGrid.tsx) | AG Grid results. |
| [`ResultsToolbar.tsx`](frontend/src/components/search/ResultsToolbar.tsx) | Actions/export/list add. |
| [`AddToListDialog.tsx`](frontend/src/components/search/AddToListDialog.tsx) | List creation/append. |
| [`searchStore.ts`](frontend/src/stores/searchStore.ts) | Keyword/query client state. |

### 11.5 Lists components

| Component | Backend dependency | Data in/out |
|---|---|---|
| [`ListsPage.tsx`](frontend/src/pages/ListsPage.tsx) | lists endpoints, screenings list | Filter by active screen, run LLM screening. |
| [`ListCompanyDetailDrawer.tsx`](frontend/src/components/lists/ListCompanyDetailDrawer.tsx) | list company detail | Company metadata display. |
| [`ExportDialog.tsx`](frontend/src/components/search/ExportDialog.tsx) | export endpoints | List/search export. |

### 11.6 LLM Screening components

| Component | Backend dependency | Data in/out |
|---|---|---|
| [`LLMScreeningPage.tsx`](frontend/src/pages/LLMScreeningPage.tsx) | route state + LLM endpoints | Chooses platform/independent flow. |
| [`PlatformScreenFlow.tsx`](frontend/src/components/llmScreening/PlatformScreenFlow.tsx) | prompt/run/result endpoints | Screen-associated list screening. |
| [`IndependentUseCaseFlow.tsx`](frontend/src/components/llmScreening/IndependentUseCaseFlow.tsx) | independent job endpoints | Upload/use-case flow. |
| [`BatchSizeControl.tsx`](frontend/src/components/llmScreening/BatchSizeControl.tsx) | run request | Batch size. |

### 11.7 Output Compilation

| Component | Backend dependency | Data in/out |
|---|---|---|
| [`OutputCompilationPage.tsx`](frontend/src/pages/OutputCompilationPage.tsx) | final list/export endpoints | Build/export compiled output. |

## 12. Data Flow: What Passes Between Pages

### 12.1 Screening intake -> Screening detail

Payload from backend:

```ts
{
  status: 'created' | 'duplicate',
  document_id: string,
  document: ScreeningDocumentSummary,
  screening: ScreeningDetail | null,
  existing_screenings: ScreeningDuplicateItem[],
  default_reuse_screening_id: string | null
}
```

If duplicate, show duplicate dialog. If created, navigate to `/screenings/:id`.

### 12.2 Screening detail -> Active screen

When user starts screening:

```ts
{
  screening_id: string,
  status: 'screening_started',
  message: string,
  payload: {
    screening_id: string,
    document_id: string,
    screen_name: string,
    website: string | null,
    edited_fields: Record<string, string>
  }
}
```

Then fetch detail and hydrate active screen store.

### 12.3 Active screen -> Criteria Analysis

Route:

```ts
`/criteria-analysis/${screeningId}`
```

The backend determines resume state from `pipeline_step`, `pipeline_status`, and `curr_final_criteria`.

### 12.4 Criteria Analysis -> Search

Route state:

```ts
{
  autoApplyKeywords: true,
  generatedKeywords: Keyword[],
  generatedQueryExpression: string,
  screeningId: string
}
```

The old keyword UI should read these values and auto-run or pre-fill search.

### 12.5 Search -> Lists

For selected rows:

```ts
{
  companies: [{
    company: string,
    primary_key_value: string,
    crescendo_id?: string,
    source_keywords: string[]
  }]
}
```

For all cached search results, pass only:

```ts
{
  search_id: string,
  source_keywords: string[]
}
```

### 12.6 Lists -> LLM Screening

Route state:

```ts
{
  flow: 'platform',
  listName: string,
  screeningId: string | null,
  prompts: Partial<Record<'Yes' | 'No' | 'Maybe' | 'Rationale', string>>,
  needsPromptFill?: boolean
}
```

### 12.7 LLM Screening -> Final List

Backend request should be:

```ts
{
  final_list_name: string,
  selected_result_ids: string[],
  source_list_name: string,
  screening_id: string | null
}
```

Backend maps selected result ids to company primary keys and copies metadata to final-list storage.

## 13. Backend Logic Mapping

### 13.1 Screening intake logic

Port from [`ScreeningsService.intake_pdf_upload()`](backend/app/services/screenings.py:246).

Backend steps:

1. Validate `.pdf` extension.
2. Stream upload to temp file while hashing SHA-256.
3. If hash already exists, return duplicate payload.
4. Move file to `screenings/documents/<sha>.pdf`.
5. Run extraction/parser.
6. Normalize fields through raw-to-normalized map.
7. Insert `screening_documents` and initial `screenings` row.

### 13.2 Screening start logic

Port from [`ScreeningsService.start_screening()`](backend/app/services/screenings.py:456).

Backend steps:

1. Require `screen_name`.
2. Clear other active screens.
3. Set `status='screening_started'`.
4. Set step/status to Criteria Analysis entry point.
5. Set `is_active=1`.
6. Persist LLM request/response audit payload if desired.

### 13.3 Criteria Analysis logic

Port route shape from [`criteria_analysis.py`](backend/app/routers/criteria_analysis.py).

Backend steps:

1. Ensure requested screen is active.
2. Return current criteria payload and persisted pipeline state.
3. On progress, update `pipeline_step` and `pipeline_status`.
4. On refine/finalize, save `curr_final_criteria`.
5. On rerun, clear `curr_final_criteria`, reset step/status, keep screen active.

### 13.4 Prompt generation logic

Port from [`generate_prompts()`](backend/app/routers/llm_screening.py:81).

Backend steps:

1. Resolve `screening_id`.
2. Load screening detail.
3. Prefer `curr_final_criteria`.
4. Fallback to `edited_fields.investment_criteria` or `edited_fields.geographical_focus`.
5. Build Yes/No/Maybe/Rationale prompts.

### 13.5 List logic

Port from [`ListsRepository`](backend/app/storage/lists_repo.py:40).

Backend steps:

1. Create list with optional `screening_id` and `screen_name`.
2. Add companies by `primary_key_value` identity.
3. Merge source keywords for duplicate company entries.
4. Preserve timestamps.
5. Filter summaries by `__none__`, `__associated__`, or concrete `screening_id`.

### 13.6 Search-to-list logic

The old repo must not send 100k+ rows through the browser.

Backend steps:

1. Search returns `search_id`.
2. Search service caches full results server-side.
3. Add-to-list endpoint accepts `search_id`.
4. Backend expands cached results into `list_companies`.

### 13.7 LLM Screening logic

Implement after list logic is stable.

Backend steps:

1. Create `llm_screening_runs` row with source list and prompts.
2. Snapshot list companies at run start or record source list version/timestamp.
3. Process rows in batches.
4. Insert/update `llm_screening_results` rows.
5. Update run counts/progress.
6. Expose polling endpoint for UI progress.
7. Final-list endpoint copies selected result rows to list storage.

## 14. What Maps to What: Old Repo -> New Pipeline

| Old repo concept | New pipeline concept | Migration action |
|---|---|---|
| Search keywords table | `KeywordInput[]` | Map row id/number to `serial`, text to `keyword`. |
| Search query text | `query_expression` | Preserve boolean expression if old UI has one. |
| Search result company id | `primary_key_value` | Must be stable and match index metadata. |
| Search result company name | `company_name` / `company` | Display only; not the identity. |
| Old saved list | `saved_lists` row | Add `screening_id`, `screen_name`. |
| Old saved company | `list_companies` row | Use `primary_key_value` as primary identity. |
| Old criteria text | `curr_final_criteria` | Store on `screenings`. |
| Old screen/project | `screenings` row | Create row per screen/project. |
| Old active project/session | `is_active=1` screening | Backend source of active-screen bar. |
| Old LLM classification row | `llm_screening_results` row | Keep decision/rationale/status per company. |
| Old final export | final screen-associated list | Export from final list plus LLM metadata. |

## 15. API Type Contracts to Copy Into Old Frontend

Copy or recreate these TypeScript contracts in the old frontend API types.

### 15.1 Screening types

```ts
interface ScreeningSummary {
  id: string;
  screen_name: string | null;
  status: 'draft' | 'screening_started';
  pipeline_step: number;
  pipeline_status: string;
  is_active: boolean;
  curr_final_criteria?: string | null;
  original_filename: string;
  updated_at: string;
}
```

### 15.2 Keyword/search types

```ts
interface KeywordInput {
  serial: number;
  keyword: string;
  mode: 'lexical' | 'semantic';
  action: 'include' | 'exclude';
  weight: number;
}

interface SearchResultRow {
  primary_key_value: string;
  company_name: string | null;
  matched_keywords: string[];
  matched_serials: number[];
  metadata: Record<string, unknown>;
}
```

### 15.3 List types

```ts
interface ListSummary {
  name: string;
  count: number;
  screening_id?: string | null;
  screen_name?: string | null;
  created_at?: string;
  updated_at: string;
}

interface ListCompanyEntry {
  company: string;
  primary_key_value?: string | null;
  source_keywords?: string[];
  added_at?: string;
  crescendo_id?: string | null;
}
```

### 15.4 Criteria response type

```ts
interface CriteriaAnalysisResponse {
  initial_understanding: {
    table: { columns: { key: string; label: string }[]; rows: Record<string, string>[] };
    text: { type: 'bullet_list' | 'paragraph'; items: string[] };
  };
  questions: Array<{
    id: string;
    category: string;
    question_concise: string;
    question_detailed?: string;
    answer: string | null;
  }>;
  current_final_criteria: { content_markdown: string };
  screening_id?: string | null;
  pipeline_step: number;
  pipeline_status: string;
  criteria_completed: boolean;
}
```

## 16. Active Screen Rules

### 16.1 Backend rules

- Only one screening should have `is_active=1` at a time.
- Starting or reactivating a screen clears all other active flags.
- `GET /screenings/active` returns `404` if no screen is active.

### 16.2 Frontend rules

- The active-screen bar reads from hydrated backend detail.
- Screen-aware dropdowns default to active screen.
- Dropdown selected label uses Screen Name, not raw id.
- User can change dropdown manually, but if active screen changes, default should reset to the new active screen.

## 17. Integration Checklist by Milestone

### Milestone A: Schema and backend boot

- Add settings for screening/list paths.
- Create/migrate `screening_documents`.
- Create/migrate `screenings`.
- Create/migrate `saved_lists`.
- Create/migrate `list_companies`.
- Register screening/list/criteria routers.
- Confirm old backend starts with empty DBs.

### Milestone B: Active screen and intake

- Import screening intake UI.
- Wire upload endpoint.
- Wire duplicate dialog.
- Wire screening detail page.
- Wire field PATCH merge behavior.
- Wire start screening and active-screen bar.

### Milestone C: Criteria Analysis

- Import Criteria Analysis UI.
- Implement analyze/progress/refine/rerun endpoints.
- Persist and resume step 2/final state.
- Confirm Repeat resets database state.
- Save final criteria to `curr_final_criteria`.

### Milestone D: Old keyword search UI bridge

- Keep old keyword UI.
- Map old keyword rows to `KeywordInput`.
- Accept generated keywords from Criteria Analysis route state.
- Return compatible `SearchPageResponse`.
- Preserve `search_id` cache behavior.

### Milestone E: Lists

- Add list create/filter/detail endpoints.
- Add selected rows to lists.
- Add all cached search rows server-side.
- Default list filters to active screen.
- Pass list/screen/prompts to LLM Screening.

### Milestone F: LLM Screening

- Add run/result tables.
- Add create/status/results endpoints.
- Replace stub rows with backend rows.
- Add selected rows to final list.
- Persist decision/rationale metadata.

### Milestone G: Output

- Find final list by active screen.
- Export final list with LLM metadata.
- Mark pipeline complete.

## 18. Testing Plan for Old Repo Migration

### 18.1 Backend tests

Add tests for:

- PDF upload creates `screening_documents` and `screenings`.
- Duplicate PDF returns duplicate payload.
- PATCH rejects raw field labels and accepts normalized keys.
- Start screening requires Screen Name and sets one active screen.
- Criteria progress updates `pipeline_step` and `pipeline_status`.
- Criteria refine saves `curr_final_criteria`.
- Criteria rerun clears `curr_final_criteria` and resets progress.
- Lists can be filtered by concrete `screening_id`, `__none__`, and `__associated__`.
- Search cached add-to-list does not require sending all rows to frontend.
- LLM run creation stores prompts and source list.
- Final-list endpoint inserts selected result rows only.

### 18.2 Frontend checks

- Active-screen bar appears after start.
- Criteria page resumes final state after browser refresh.
- Repeat confirmation resets Criteria Analysis UI and DB.
- Old keyword UI accepts generated keywords and expression.
- Search results add to screen-associated list.
- Lists dropdown shows Screen Name, not id.
- LLM Screening Add to Final List adds selected rows only.

## 19. Common Pitfalls

- **Using company name as identity**: use `primary_key_value` for list membership and LLM result mapping.
- **Only storing state in frontend store**: persist pipeline state in `screenings`.
- **Replacing `edited_fields` instead of merging**: PATCH semantics must merge.
- **Accepting raw PDF field keys**: only normalized snake-case keys should be accepted.
- **Losing active screen after refresh**: hydrate from backend `/screenings/active`.
- **Sending huge search results to browser**: use `search_id` and server-side add-to-list.
- **Showing ids in dropdown triggers**: render selected Screen Name manually if the select library displays raw values.
- **Starting LLM integration before lists are stable**: LLM Screening depends on source lists and stable company ids.

## 20. Final Definition of Done

- Old repo can run the migrated pipeline from PDF upload through final export.
- Database schema supports all workflow state and survives refresh/restart.
- Old keyword UI remains usable but speaks the new search/list contracts.
- Active screen defaults work everywhere a screen selector exists.
- Criteria Analysis resumes and resets correctly.
- Final criteria feeds prompt generation.
- LLM Screening stores durable run/results data.
- Final List contains exactly selected companies plus decision/rationale metadata.
- All new backend state has tests or manual verification scripts.
