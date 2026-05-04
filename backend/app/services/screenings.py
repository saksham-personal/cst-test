from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.schemas.screenings import (
    ScreeningDetail,
    ScreeningDocumentSummary,
    ScreeningDuplicateCreateRequest,
    ScreeningDuplicateItem,
    ScreeningFieldPatchRequest,
    ScreeningFieldPatchResponse,
    ScreeningIntakeResponse,
    ScreeningStartResponse,
    ScreeningSummary,
)
from app.storage.screenings_repo import ScreeningsRepository


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


class ScreeningsService:
    STEP_FORM_UPLOADED = 1
    STEP_AWAITING_LLM_QA = 2
    STEP_USER_QA_PENDING = 3
    STEP_GENERATING_CRITERIA = 4
    STEP_KEYWORD_SEARCH = 5

    PIPELINE_STATUS_FORM_UPLOADED = "FORM_UPLOADED"
    PIPELINE_STATUS_AWAITING_LLM_QA = "AWAITING_LLM_QA"
    PIPELINE_STATUS_USER_QA_PENDING = "USER_QA_PENDING"
    PIPELINE_STATUS_GENERATING_CRITERIA = "GENERATING_CRITERIA"
    PIPELINE_STATUS_KEYWORD_SEARCH = "KEYWORD_SEARCH"

    RAW_TO_NORMALIZED: dict[str, str] = {
        "Type": "type",
        "Name": "name",
        "HQ": "hq",
        "Sponsor name": "sponsor_name",
        "Sponsor Relationship": "sponsor_relationship",
        "Screening Request Name": "screening_request_name",
        "Submitter Name": "submitter_name",
        "Submitter SID": "submitter_sid",
        "Senior Client Exec(s)": "senior_client_execs",
        "Target Sector": "target_sector",
        "Target Revenue": "target_revenue",
        "Target EBITDA": "target_ebitda",
        "Investment Criteria": "investment_criteria",
        "Geographical Focus": "geographical_focus",
    }

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.documents_dir = Path(settings.screening_documents_dir)
        self.repo = ScreeningsRepository(settings.screenings_db_path, settings.screening_documents_dir)

    def _clean_optional_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _clean_field_value(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _blank_normalized_fields(self) -> dict[str, str]:
        return {normalized: "" for normalized in self.RAW_TO_NORMALIZED.values()}

    def _normalize_raw_payload(self, payload: dict[str, Any] | None) -> dict[str, str]:
        normalized = self._blank_normalized_fields()
        raw = payload or {}
        for raw_key, normalized_key in self.RAW_TO_NORMALIZED.items():
            normalized[normalized_key] = self._clean_field_value(raw.get(raw_key))
        return normalized

    def _extract_with_pdfplumber_stub(self, pdf_path: Path) -> dict[str, Any]:
        try:
            import pdfplumber  # type: ignore[import-not-found]

            try:
                with pdfplumber.open(pdf_path) as pdf:
                    _ = len(pdf.pages)
            except Exception:
                pass
        except ModuleNotFoundError:
            pass

        display_name = pdf_path.stem.replace("_", " ").replace("-", " ").strip().title() or "Uploaded Screening"
        return {
            "Type": "Screening Form",
            "Name": display_name,
            "HQ": "",
            "Sponsor name": "",
            "Sponsor Relationship": "",
            "Screening Request Name": display_name,
            "Submitter Name": "",
            "Submitter SID": "",
            "Senior Client Exec(s)": "",
            "Target Sector": "",
            "Target Revenue": "",
            "Target EBITDA": "",
            "Investment Criteria": "Stub extraction output. Replace with the real parser when ready.",
            "Geographical Focus": "",
        }

    def _document_summary(self, document: dict[str, Any]) -> ScreeningDocumentSummary:
        return ScreeningDocumentSummary(
            id=str(document.get("id", "")),
            original_filename=str(document.get("original_filename", "")).strip(),
            pdf_sha256=str(document.get("pdf_sha256", "")).strip(),
            file_size_bytes=int(document.get("file_size_bytes") or 0),
            mime_type=self._clean_optional_text(document.get("mime_type")),
        )

    def _duplicate_item(self, screening: dict[str, Any]) -> ScreeningDuplicateItem:
        return ScreeningDuplicateItem(
            id=str(screening.get("id", "")).strip(),
            status=str(screening.get("status", "draft")).strip() or "draft",
            screen_name=self._clean_optional_text(screening.get("screen_name")),
            website=self._clean_optional_text(screening.get("website")),
            pipeline_step=int(screening.get("pipeline_step") or self.STEP_FORM_UPLOADED),
            pipeline_status=str(screening.get("pipeline_status") or self.PIPELINE_STATUS_FORM_UPLOADED),
            is_active=bool(screening.get("is_active", False)),
            created_at=str(screening.get("created_at", "")).strip(),
            updated_at=str(screening.get("updated_at", "")).strip(),
        )

    def _summary(self, screening: dict[str, Any]) -> ScreeningSummary:
        return ScreeningSummary(
            id=str(screening.get("id", "")).strip(),
            screen_name=self._clean_optional_text(screening.get("screen_name")),
            status=str(screening.get("status", "draft")).strip() or "draft",
            pipeline_step=int(screening.get("pipeline_step") or self.STEP_FORM_UPLOADED),
            pipeline_status=str(screening.get("pipeline_status") or self.PIPELINE_STATUS_FORM_UPLOADED),
            is_active=bool(screening.get("is_active", False)),
            curr_final_criteria=self._clean_optional_text(screening.get("curr_final_criteria")),
            original_filename=str(screening.get("original_filename", "")).strip(),
            updated_at=str(screening.get("updated_at", "")).strip(),
        )

    def _detail(self, screening: dict[str, Any]) -> ScreeningDetail:
        return ScreeningDetail(
            id=str(screening.get("id", "")).strip(),
            document_id=str(screening.get("document_id", "")).strip(),
            status=str(screening.get("status", "draft")).strip() or "draft",
            screen_name=self._clean_optional_text(screening.get("screen_name")),
            website=self._clean_optional_text(screening.get("website")),
            inbound_date=self._clean_optional_text(screening.get("inbound_date")),
            target_date=self._clean_optional_text(screening.get("target_date")),
            targets_found=(int(screening["targets_found"]) if screening.get("targets_found") is not None else None),
            output_file=self._clean_optional_text(screening.get("output_file")),
            extracted_fields={
                str(key): self._clean_field_value(value)
                for key, value in dict(screening.get("extracted_fields", {}) or {}).items()
            },
            edited_fields={
                str(key): self._clean_field_value(value)
                for key, value in dict(screening.get("edited_fields", {}) or {}).items()
            },
            pipeline_step=int(screening.get("pipeline_step") or self.STEP_FORM_UPLOADED),
            pipeline_status=str(screening.get("pipeline_status") or self.PIPELINE_STATUS_FORM_UPLOADED),
            is_active=bool(screening.get("is_active", False)),
            curr_final_criteria=self._clean_optional_text(screening.get("curr_final_criteria")),
            original_filename=str(screening.get("original_filename", "")).strip(),
            pdf_sha256=str(screening.get("pdf_sha256", "")).strip(),
            created_at=str(screening.get("created_at", "")).strip(),
            updated_at=str(screening.get("updated_at", "")).strip(),
        )

    def _load_screening_or_raise(self, screening_id: str) -> dict[str, Any]:
        screening = self.repo.get_screening(screening_id)
        if screening is None:
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        return screening

    def _load_document_or_raise(self, document_id: str) -> dict[str, Any]:
        document = self.repo.get_document_by_id(document_id)
        if document is None:
            raise NotFoundError(f"Screening document '{document_id}' not found.")
        return document

    def list_screenings(self) -> list[ScreeningSummary]:
        return [self._summary(screening) for screening in self.repo.list_screenings()]

    def get_active_screening(self) -> ScreeningDetail:
        screening = self.repo.get_active_screening()
        if screening is None:
            raise NotFoundError("No screen is activated.")
        return self._detail(screening)

    def ensure_active_screening(self, screening_id: str) -> ScreeningDetail:
        screening = self._load_screening_or_raise(screening_id)
        if screening.get("is_active"):
            return self._detail(screening)
        active = self.repo.get_active_screening()
        if active is None:
            if str(screening.get("status", "")).strip() == "screening_started":
                self.repo.clear_active_screening(exclude_screening_id=screening_id)
                updated = dict(screening)
                updated["is_active"] = True
                updated["updated_at"] = _now_iso()
                saved = self.repo.update_screening(updated)
                if saved is None:  # pragma: no cover - defensive path
                    raise NotFoundError(f"Screening '{screening_id}' not found.")
                return self._detail(saved)
            raise ValidationAppError("No screen is activated.")
        active_name = self._clean_optional_text(active.get("screen_name")) or str(active.get("id", "")).strip()
        raise ValidationAppError(
            f"Criteria analysis is only available for the active screen '{active_name}'.",
            details={
                "active_screening_id": str(active.get("id", "")).strip(),
            },
        )

    def update_pipeline_state(
        self,
        screening_id: str,
        *,
        pipeline_step: int,
        pipeline_status: str,
        is_active: bool | None = None,
    ) -> ScreeningDetail:
        screening = self._load_screening_or_raise(screening_id)
        updated = dict(screening)
        updated["pipeline_step"] = int(pipeline_step)
        updated["pipeline_status"] = str(pipeline_status)
        if is_active is not None:
            updated["is_active"] = bool(is_active)
        updated["updated_at"] = _now_iso()
        saved = self.repo.update_screening(updated)
        if saved is None:  # pragma: no cover - defensive path
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        return self._detail(saved)

    def intake_pdf_upload(self, upload: UploadFile) -> ScreeningIntakeResponse:
        source_filename = Path(upload.filename or "uploaded.pdf").name
        if Path(source_filename).suffix.lower() != ".pdf":
            raise ValidationAppError("Only .pdf uploads are supported for screening intake.")

        temp_path = self.documents_dir / f".upload_{uuid.uuid4().hex}.pdf"
        sha256 = hashlib.sha256()
        file_size_bytes = 0

        try:
            with temp_path.open("wb") as dest:
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    sha256.update(chunk)
                    file_size_bytes += len(chunk)
                    dest.write(chunk)
        finally:
            try:
                upload.file.close()
            except Exception:
                pass

        pdf_sha256 = sha256.hexdigest()
        existing_document = self.repo.get_document_by_hash(pdf_sha256)
        if existing_document is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except TypeError:  # pragma: no cover - Python compatibility fallback
                if temp_path.exists():
                    temp_path.unlink()
            linked = [self._duplicate_item(item) for item in self.repo.list_screenings_for_document(existing_document["id"])]
            return ScreeningIntakeResponse(
                status="duplicate",
                document_id=str(existing_document["id"]),
                document=self._document_summary(existing_document),
                screening=None,
                existing_screenings=linked,
                default_reuse_screening_id=(linked[0].id if linked else None),
            )

        final_path = self.documents_dir / f"{pdf_sha256}.pdf"
        if final_path.exists():
            try:
                temp_path.unlink(missing_ok=True)
            except TypeError:  # pragma: no cover - Python compatibility fallback
                if temp_path.exists():
                    temp_path.unlink()
        else:
            temp_path.replace(final_path)

        raw_payload = self._extract_with_pdfplumber_stub(final_path)
        now = _now_iso()
        document = self.repo.create_document(
            {
                "id": f"doc_{uuid.uuid4().hex[:16]}",
                "pdf_sha256": pdf_sha256,
                "original_filename": source_filename,
                "storage_path": str(final_path),
                "file_size_bytes": file_size_bytes,
                "mime_type": upload.content_type or "application/pdf",
                "extraction_status": "completed",
                "raw_extraction_payload": raw_payload,
                "extraction_version": "stub-v1",
                "created_at": now,
                "updated_at": now,
            }
        )
        normalized = self._normalize_raw_payload(raw_payload)
        screening = self.repo.create_screening(
            {
                "id": f"scr_{uuid.uuid4().hex[:16]}",
                "document_id": str(document["id"]),
                "status": "draft",
                "screen_name": None,
                "website": None,
                "inbound_date": None,
                "target_date": None,
                "targets_found": None,
                "output_file": None,
                "extracted_fields": normalized,
                "edited_fields": dict(normalized),
                "pipeline_step": self.STEP_FORM_UPLOADED,
                "pipeline_status": self.PIPELINE_STATUS_FORM_UPLOADED,
                "is_active": False,
                "llm_request_json": None,
                "llm_response_json": None,
                "curr_final_criteria": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        return ScreeningIntakeResponse(
            status="created",
            document_id=str(document["id"]),
            document=self._document_summary(document),
            screening=self._detail(screening),
            existing_screenings=[],
            default_reuse_screening_id=None,
        )

    def create_duplicate_screening(
        self,
        payload: ScreeningDuplicateCreateRequest | dict[str, Any] | str,
    ) -> ScreeningDetail:
        if isinstance(payload, ScreeningDuplicateCreateRequest):
            document_id = payload.document_id
        elif isinstance(payload, dict):
            document_id = str(payload.get("document_id", "")).strip()
        else:
            document_id = str(payload).strip()
        document = self._load_document_or_raise(document_id)
        now = _now_iso()
        normalized = self._normalize_raw_payload(document.get("raw_extraction_payload", {}))
        screening = self.repo.create_screening(
            {
                "id": f"scr_{uuid.uuid4().hex[:16]}",
                "document_id": str(document["id"]),
                "status": "draft",
                "screen_name": None,
                "website": None,
                "inbound_date": None,
                "target_date": None,
                "targets_found": None,
                "output_file": None,
                "extracted_fields": normalized,
                "edited_fields": dict(normalized),
                "pipeline_step": self.STEP_FORM_UPLOADED,
                "pipeline_status": self.PIPELINE_STATUS_FORM_UPLOADED,
                "is_active": False,
                "llm_request_json": None,
                "llm_response_json": None,
                "curr_final_criteria": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        return self._detail(screening)

    def get_screening(self, screening_id: str) -> ScreeningDetail:
        return self._detail(self._load_screening_or_raise(screening_id))

    def save_current_final_criteria(self, screening_id: str, criteria_markdown: str) -> ScreeningDetail:
        screening = self._load_screening_or_raise(screening_id)
        updated = dict(screening)
        updated["curr_final_criteria"] = self._clean_optional_text(criteria_markdown)
        updated["updated_at"] = _now_iso()
        saved = self.repo.update_screening(updated)
        if saved is None:  # pragma: no cover - defensive path
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        return self._detail(saved)

    def reset_criteria_analysis(self, screening_id: str) -> ScreeningDetail:
        screening = self._load_screening_or_raise(screening_id)
        updated = dict(screening)
        updated["curr_final_criteria"] = None
        updated["pipeline_step"] = self.STEP_AWAITING_LLM_QA
        updated["pipeline_status"] = self.PIPELINE_STATUS_AWAITING_LLM_QA
        updated["is_active"] = True
        updated["updated_at"] = _now_iso()
        saved = self.repo.update_screening(updated)
        if saved is None:  # pragma: no cover - defensive path
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        return self._detail(saved)

    def patch_screening(self, screening_id: str, payload: ScreeningFieldPatchRequest) -> ScreeningFieldPatchResponse:
        screening = self._load_screening_or_raise(screening_id)
        updated = dict(screening)
        fields_set = payload.model_fields_set
        if "screen_name" in fields_set:
            updated["screen_name"] = self._clean_optional_text(payload.screen_name)
        if "website" in fields_set:
            updated["website"] = self._clean_optional_text(payload.website)
        if payload.edited_fields:
            allowed_field_keys = set(self.RAW_TO_NORMALIZED.values())
            invalid_keys = sorted(str(key) for key in payload.edited_fields if str(key) not in allowed_field_keys)
            if invalid_keys:
                raise ValidationAppError(
                    "Only normalized screening field keys can be edited.",
                    details={"invalid_keys": invalid_keys, "allowed_keys": sorted(allowed_field_keys)},
                )
            merged = {
                str(key): self._clean_field_value(value)
                for key, value in dict(updated.get("edited_fields", {}) or {}).items()
            }
            for key, value in payload.edited_fields.items():
                merged[str(key)] = self._clean_field_value(value)
            updated["edited_fields"] = merged
        updated["updated_at"] = _now_iso()
        saved = self.repo.update_screening(updated)
        if saved is None:  # pragma: no cover - defensive path
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        detail = self._detail(saved)
        return ScreeningFieldPatchResponse(
            screening_id=detail.id,
            status=detail.status,
            screen_name=detail.screen_name,
            website=detail.website,
            edited_fields=detail.edited_fields,
            updated_at=detail.updated_at,
        )

    def get_pdf_path(self, screening_id: str) -> Path:
        screening = self._load_screening_or_raise(screening_id)
        pdf_path = Path(str(screening.get("storage_path", "")).strip())
        if not pdf_path.exists():
            raise NotFoundError(f"Stored PDF for screening '{screening_id}' not found.")
        return pdf_path

    def start_screening(self, screening_id: str) -> ScreeningStartResponse:
        screening = self._load_screening_or_raise(screening_id)
        screen_name = self._clean_optional_text(screening.get("screen_name"))
        if not screen_name:
            raise ValidationAppError("Screen Name is required before starting screening.")

        payload = {
            "screening_id": str(screening.get("id", "")).strip(),
            "document_id": str(screening.get("document_id", "")).strip(),
            "screen_name": screen_name,
            "website": self._clean_optional_text(screening.get("website")),
            "edited_fields": {
                str(key): self._clean_field_value(value)
                for key, value in dict(screening.get("edited_fields", {}) or {}).items()
            },
        }
        llm_request = {
            "stage": "llm_stub",
            "requested_at": _now_iso(),
            "payload": payload,
        }
        llm_response = {
            "message": "LLM step is TODO. Returning saved draft payload.",
            "payload": payload,
        }
        self.repo.clear_active_screening(exclude_screening_id=screening_id)
        updated = dict(screening)
        updated["status"] = "screening_started"
        updated["pipeline_step"] = self.STEP_AWAITING_LLM_QA
        updated["pipeline_status"] = self.PIPELINE_STATUS_AWAITING_LLM_QA
        updated["is_active"] = True
        updated["llm_request_json"] = llm_request
        updated["llm_response_json"] = llm_response
        updated["updated_at"] = _now_iso()
        saved = self.repo.update_screening(updated)
        if saved is None:  # pragma: no cover - defensive path
            raise NotFoundError(f"Screening '{screening_id}' not found.")
        return ScreeningStartResponse(
            screening_id=str(saved.get("id", "")).strip(),
            status=str(saved.get("status", "screening_started")).strip() or "screening_started",
            message=str(llm_response["message"]),
            payload=dict(llm_response["payload"]),
        )
