# Chat Change Diff Compendium

## Purpose
This document compiles the changes made during this chat into one place.

Because this workspace is **not** a Git repository, this is a **human-curated diff summary** rather than a literal `git diff` export. It covers:
- planning documents created in the chat
- backend code changes
- frontend code changes
- tests and validation work
- local runtime artifacts created during implementation and browser testing

---

## 1. Planning artifacts created

### Added
- `plans/monday-changes-screening-intake-patch-plan.md`

### What it contains
- full architecture plan for PDF intake and screening flow
- backend and frontend implementation map
- proposed schema, routes, UI flow, and testing plan
- branch recommendation for `monday-changes` (not created because the workspace is not a Git repo)

---

## 2. Backend changes

## 2.1 Dependency changes

### Modified
- `backend/requirements.txt`
- `backend/pyproject.toml`

### Diff summary
- added `pdfplumber>=0.11.0`

### Why
- establishes the parser dependency boundary for screening PDF extraction
- current extraction remains a stub, but the package is now part of the backend dependency set

---

## 2.2 Configuration and dependency wiring

### Modified
- `backend/app/core/config.py`
- `backend/app/core/dependencies.py`
- `backend/app/main.py`

### `backend/app/core/config.py`
Added new settings for screening persistence:
- `screenings_dir`
- `screenings_db_path`
- `screening_documents_dir`

Added helper factories:
- `_default_screenings_dir()`
- `_default_screenings_db_path()`
- `_default_screening_documents_dir()`

### `backend/app/core/dependencies.py`
Added:
- import for `ScreeningsService`
- `get_screenings_service()` dependency provider

### `backend/app/main.py`
Added:
- new OpenAPI tag: `screenings`
- `app.state.screenings_service`
- router registration for screening endpoints

### Why
- integrates the screening feature into the existing app-state service architecture already used by the backend

---

## 2.3 New backend schema file

### Added
- `backend/app/schemas/screenings.py`

### New models
- `ScreeningDocumentSummary`
- `ScreeningDuplicateItem`
- `ScreeningDetail`
- `ScreeningIntakeResponse`
- `ScreeningDuplicateCreateRequest`
- `ScreeningFieldPatchRequest`
- `ScreeningFieldPatchResponse`
- `ScreeningStartResponse`

### New literals
- `ScreeningStatus`
- `ScreeningIntakeStatus`

### Why
- formalizes request and response contracts for upload, duplicate handling, autosave, detail loading, PDF retrieval, and start-screening stub flow

---

## 2.4 New backend storage file

### Added
- `backend/app/storage/screenings_repo.py`

### New repository responsibilities
- initialize and manage screening SQLite database
- create `screening_documents` table
- create `screenings` table
- decode/encode JSON payload columns
- fetch documents by hash or id
- create document records
- list screenings linked to one document
- create screening draft records
- fetch fully joined screening detail with document metadata
- update persisted screening state

### SQLite schema introduced

#### `screening_documents`
- `id`
- `pdf_sha256`
- `original_filename`
- `storage_path`
- `file_size_bytes`
- `mime_type`
- `extraction_status`
- `raw_extraction_payload_json`
- `extraction_version`
- `created_at`
- `updated_at`

#### `screenings`
- `id`
- `document_id`
- `status`
- `screen_name`
- `website`
- `inbound_date`
- `target_date`
- `targets_found`
- `output_file`
- `extracted_fields_json`
- `edited_fields_json`
- `llm_request_json`
- `llm_response_json`
- `created_at`
- `updated_at`

### Why
- separates deduplicated uploaded PDF documents from mutable screening drafts
- allows one stored PDF to back multiple screening drafts

---

## 2.5 New backend service file

### Added
- `backend/app/services/screenings.py`

### New service responsibilities
- upload and hash PDF files
- deduplicate PDFs by SHA-256
- store PDF documents under the screening documents directory
- run extraction via a `pdfplumber`-shaped stub
- normalize raw extraction keys into frontend-safe snake_case keys
- create new draft screenings
- create fresh drafts from an existing deduplicated document
- patch top-level and extracted fields
- return PDF path for preview streaming
- enforce `Screen Name` before starting the workflow
- return a stubbed LLM start response

### Key normalization map introduced
- `Type -> type`
- `Name -> name`
- `HQ -> hq`
- `Sponsor name -> sponsor_name`
- `Sponsor Relationship -> sponsor_relationship`
- `Screening Request Name -> screening_request_name`
- `Submitter Name -> submitter_name`
- `Submitter SID -> submitter_sid`
- `Senior Client Exec(s) -> senior_client_execs`
- `Target Sector -> target_sector`
- `Target Revenue -> target_revenue`
- `Target EBITDA -> target_ebitda`
- `Investment Criteria -> investment_criteria`
- `Geographical Focus -> geographical_focus`

### Stub extraction behavior
- extraction opens the PDF via `pdfplumber` if available
- returns a stub JSON payload with the expected business fields
- keeps the parser isolated so real extraction can replace the stub later

### Why
- centralizes business logic and keeps routers and repositories thin

---

## 2.6 New backend router file

### Added
- `backend/app/routers/screenings.py`

### New endpoints
- `POST /api/v1/screenings/intake`
- `POST /api/v1/screenings/intake/duplicate-create`
- `GET /api/v1/screenings/{screening_id}`
- `PATCH /api/v1/screenings/{screening_id}/fields`
- `GET /api/v1/screenings/{screening_id}/pdf`
- `POST /api/v1/screenings/{screening_id}/start`

### Follow-up patch applied later
The PDF response was updated to serve with inline content disposition instead of download disposition:
- `content_disposition_type="inline"`

### Why
- enables browser-based preview in an iframe instead of forced file download

---

## 2.7 New backend tests

### Added
- `backend/tests/test_screenings.py`

### Covered scenarios
- new PDF upload creates a screening document and a draft screening
- duplicate PDF upload returns duplicate status
- duplicate-create generates a new screening draft for the same document
- field patch autosave updates screening data
- PDF endpoint returns a PDF stream
- start-screening succeeds when `screen_name` is set
- start-screening fails when `screen_name` is missing

### Test helper details
- test PDF bytes are generated in-memory
- extraction stub is monkeypatched for determinism

---

## 3. Frontend changes

## 3.1 API layer changes

### Modified
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/api/endpoints.ts`
- `frontend/src/api.ts`

### `frontend/src/api/client.ts`
Adjusted the global error parser so it now reads both:
- legacy `response.data.detail`
- backend app-error shape `response.data.error.message`

### `frontend/src/api/types.ts`
Added new types:
- `ScreeningDocumentSummary`
- `ScreeningDuplicateItem`
- `ScreeningDetail`
- `ScreeningIntakeResponse`
- `ScreeningFieldPatchRequest`
- `ScreeningFieldPatchResponse`
- `ScreeningStartResponse`

### `frontend/src/api/endpoints.ts`
Added new helpers:
- `uploadScreeningIntake()`
- `createDuplicateScreening()`
- `getScreeningDetail()`
- `patchScreeningFields()`
- `getScreeningPdfUrl()`
- `startScreening()`

### `frontend/src/api.ts`
Re-exported all new screening endpoint helpers and types for compatibility with the repo’s flat API import surface

### Why
- gives the UI a typed API layer for the intake, draft, preview, autosave, and stub start-screening flow

---

## 3.2 Routing and navigation changes

### Modified
- `frontend/src/App.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

### `frontend/src/App.tsx`
Added routes:
- `/screenings/new`
- `/screenings/:id`

### `frontend/src/components/layout/Sidebar.tsx`
Added a new top navigation item:
- label: `Form Intake`
- path: `/screenings/new`
- icon: `FileText`

### Why
- introduces the new intake workflow as a first-class top-level app route

---

## 3.3 New screening UI components

### Added
- `frontend/src/components/screenings/ScreeningPdfPreview.tsx`
- `frontend/src/components/screenings/UploadPdfCard.tsx`
- `frontend/src/components/screenings/ScreeningDuplicateDialog.tsx`
- `frontend/src/components/screenings/EditableFieldCard.tsx`
- `frontend/src/components/screenings/ScreeningFieldGrid.tsx`

### `ScreeningPdfPreview.tsx`
Responsibilities:
- inline PDF preview card
- show/hide preview toggle
- renders `iframe` preview from either local object URL or backend PDF endpoint URL

### `UploadPdfCard.tsx`
Responsibilities:
- drag-and-drop PDF selection
- click-to-browse PDF picker
- file summary row with remove action
- upload progress bar
- preview toggle button
- upload trigger button

### `ScreeningDuplicateDialog.tsx`
Responsibilities:
- duplicate warning dialog
- list existing screenings linked to the same document
- allow `Reuse existing`
- allow `Create new screening`
- allow `Cancel`

### `EditableFieldCard.tsx`
Responsibilities:
- render one extracted field as a card
- copy-to-clipboard button
- double-click-to-edit behavior
- save on blur / Enter
- multiline support for long fields
- local saving indicator

### `ScreeningFieldGrid.tsx`
Responsibilities:
- central field config list
- map normalized field keys to labels
- render responsive card grid

### Follow-up patch applied later
`ScreeningFieldGrid.tsx` received a type fix:
- field config was explicitly typed as `Array<{ key: string; label: string; multiline?: boolean }>`

### Why
- keeps the new workflow modular and aligned with the existing component style in the app

---

## 3.4 New screening pages

### Added
- `frontend/src/pages/ScreeningIntakePage.tsx`
- `frontend/src/pages/ScreeningDetailPage.tsx`

### `ScreeningIntakePage.tsx`
Responsibilities:
- select PDF
- generate local object URL preview
- upload to backend with progress
- open duplicate dialog if needed
- navigate to created or reused detail route

### `ScreeningDetailPage.tsx`
Responsibilities:
- fetch draft detail by route id
- show required `Screen Name` input
- show optional `Website` input
- keep PDF preview toggleable
- render editable extracted field cards
- autosave field edits via PATCH endpoint
- start the stub screening flow

### Why
- implements the two-route UX decided during planning:
  - intake route for upload
  - stable detail route for ongoing draft editing

---

## 4. Local runtime and non-source changes created during implementation

## 4.1 Installed runtime packages

Packages installed into `python_runtime` during testing:
- `pytest`
- `pdfplumber`
- `curl_cffi`
- transitive dependencies such as `cryptography`, `pdfminer.six`, `pypdfium2`, `rich`, and related packages

### New runtime script executables observed
- `python_runtime/Scripts/pytest.exe`
- `python_runtime/Scripts/pdfplumber.exe`
- `python_runtime/Scripts/curl-cffi.exe`
- `python_runtime/Scripts/pdf2txt.py`
- and several dependency-related script additions

### Why
- needed to run screening tests in the vendored Python runtime

---

## 4.2 Test and browser-validation artifacts

### Added/generated
- `tmp_validation_direct/test-screening.pdf`
- `screenings/screenings.db`
- `screenings/documents/84bd089272afb7d54cb2d2c368dc2b8fbe2faf22ca94d908ed8fe5d0b1ce53bb.pdf`

### Why
- the PDF file was created to validate the new upload flow in-browser
- the screening database and document storage were generated by the new feature itself during validation

### Note
These are local runtime artifacts, not part of the feature source code.

---

## 5. Validation performed during the chat

## 5.1 Backend validation

### Passed
- `backend/tests/test_screenings.py`

### Result
- screening feature tests pass successfully

### Full-suite status
A full backend `pytest` run was also attempted. Existing non-screening tests failed in this environment, including search/index/keyword-related cases. Those failures were **not resolved in this chat** because the implementation scope was the new screening flow.

---

## 5.2 Frontend validation

### Passed
- frontend typecheck
- frontend production build

### Result
- the new routes, types, and components compile successfully

---

## 5.3 Browser validation

### Verified via browser automation
- `/screenings/new` renders correctly
- new sidebar `Form Intake` entry is visible
- PDF can be selected from the intake page
- local PDF preview opens before upload
- upload succeeds and navigates to `/screenings/:id`
- screening detail page renders field cards
- backend PDF endpoint is called successfully

### Issue found and fixed during validation
- initial PDF endpoint behavior caused browser download instead of inline preview
- fixed by serving the PDF with inline content disposition in `backend/app/routers/screenings.py`

---

## 6. One-line file inventory

## Added files
- `plans/monday-changes-screening-intake-patch-plan.md`
- `plans/chat-change-diff-compendium.md`
- `backend/app/schemas/screenings.py`
- `backend/app/storage/screenings_repo.py`
- `backend/app/services/screenings.py`
- `backend/app/routers/screenings.py`
- `backend/tests/test_screenings.py`
- `frontend/src/components/screenings/ScreeningPdfPreview.tsx`
- `frontend/src/components/screenings/UploadPdfCard.tsx`
- `frontend/src/components/screenings/ScreeningDuplicateDialog.tsx`
- `frontend/src/components/screenings/EditableFieldCard.tsx`
- `frontend/src/components/screenings/ScreeningFieldGrid.tsx`
- `frontend/src/pages/ScreeningIntakePage.tsx`
- `frontend/src/pages/ScreeningDetailPage.tsx`

## Modified files
- `backend/requirements.txt`
- `backend/pyproject.toml`
- `backend/app/core/config.py`
- `backend/app/core/dependencies.py`
- `backend/app/main.py`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/api/endpoints.ts`
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

## Generated local artifacts
- `tmp_validation_direct/test-screening.pdf`
- `screenings/screenings.db`
- `screenings/documents/84bd089272afb7d54cb2d2c368dc2b8fbe2faf22ca94d908ed8fe5d0b1ce53bb.pdf`
- Python runtime packages under `python_runtime/Lib/site-packages/`
- Python runtime scripts under `python_runtime/Scripts/`

---

## 7. Final summary
The chat produced:
- one detailed implementation plan document
- one end-to-end screening intake feature implementation across backend and frontend
- one backend test file for the feature
- one compiled diff summary document (this file)
- one round of browser validation and one follow-up patch for inline PDF preview

This document is intended to be the single audit-style summary of all changes made in the chat.
