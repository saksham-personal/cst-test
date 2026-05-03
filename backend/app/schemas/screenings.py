from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ScreeningStatus = Literal["draft", "screening_started"]
ScreeningIntakeStatus = Literal["created", "duplicate"]


class ScreeningDocumentSummary(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "doc_123",
                "original_filename": "screening.pdf",
                "pdf_sha256": "c0ffee",
                "file_size_bytes": 2048,
                "mime_type": "application/pdf",
            }
        }
    )

    id: str = Field(description="Document identifier.")
    original_filename: str = Field(description="Original uploaded PDF filename.")
    pdf_sha256: str = Field(description="Canonical file hash used for duplicate detection.")
    file_size_bytes: int = Field(default=0, description="Stored file size in bytes.")
    mime_type: str | None = Field(default=None, description="Uploaded MIME type.")


class ScreeningDuplicateItem(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "scr_123",
                "status": "draft",
                "screen_name": "Healthcare Platform Targets",
                "website": "example.com",
                "created_at": "2026-04-12T10:00:00",
                "updated_at": "2026-04-12T10:30:00",
            }
        }
    )

    id: str = Field(description="Existing screening draft identifier.")
    status: ScreeningStatus = Field(description="Current screening workflow status.")
    screen_name: str | None = Field(default=None, description="Draft screening name if already provided.")
    website: str | None = Field(default=None, description="Optional website attached to the screening.")
    pipeline_step: int = Field(default=1, description="Current pipeline step integer.")
    pipeline_status: str = Field(default="FORM_UPLOADED", description="Current pipeline status string.")
    is_active: bool = Field(default=False, description="Whether this screening is the active screening.")
    created_at: str = Field(default="", description="ISO timestamp when the screening was created.")
    updated_at: str = Field(default="", description="ISO timestamp when the screening was last updated.")


class ScreeningSummary(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "scr_123",
                "screen_name": "Healthcare Platform Targets",
                "status": "screening_started",
                "pipeline_step": 3,
                "pipeline_status": "USER_QA_PENDING",
                "is_active": True,
                "original_filename": "screening.pdf",
                "updated_at": "2026-04-12T10:30:00",
            }
        }
    )

    id: str = Field(description="Screening identifier.")
    screen_name: str | None = Field(default=None, description="Human-friendly screening name.")
    status: ScreeningStatus = Field(description="Current screening workflow status.")
    pipeline_step: int = Field(default=1, description="Current pipeline step integer.")
    pipeline_status: str = Field(default="FORM_UPLOADED", description="Current pipeline status string.")
    is_active: bool = Field(default=False, description="Whether this screening is the active screening.")
    original_filename: str = Field(default="", description="Original uploaded PDF filename.")
    updated_at: str = Field(default="", description="ISO timestamp when the screening was last updated.")


class ScreeningDetail(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "scr_123",
                "document_id": "doc_123",
                "status": "draft",
                "screen_name": None,
                "website": None,
                "inbound_date": None,
                "target_date": None,
                "targets_found": None,
                "output_file": None,
                "extracted_fields": {"type": "Screening"},
                "edited_fields": {"type": "Screening"},
                "original_filename": "screening.pdf",
                "pdf_sha256": "c0ffee",
                "created_at": "2026-04-12T10:00:00",
                "updated_at": "2026-04-12T10:00:00",
            }
        }
    )

    id: str = Field(description="Screening identifier.")
    document_id: str = Field(description="Linked deduplicated document identifier.")
    status: ScreeningStatus = Field(description="Current screening workflow status.")
    screen_name: str | None = Field(default=None, description="Required before the screening can start.")
    website: str | None = Field(default=None, description="Optional website supplied by the user.")
    inbound_date: str | None = Field(default=None, description="Optional inbound date for future workflow use.")
    target_date: str | None = Field(default=None, description="Optional target date for future workflow use.")
    targets_found: int | None = Field(default=None, description="Optional count reserved for later screening stages.")
    output_file: str | None = Field(default=None, description="Optional output file path reserved for later stages.")
    extracted_fields: dict[str, str] = Field(default_factory=dict, description="Normalized parser output.")
    edited_fields: dict[str, str] = Field(default_factory=dict, description="Current user-edited working copy.")
    pipeline_step: int = Field(default=1, description="Current pipeline step integer.")
    pipeline_status: str = Field(default="FORM_UPLOADED", description="Current pipeline status string.")
    is_active: bool = Field(default=False, description="Whether this screening is the active screening.")
    original_filename: str = Field(description="Original uploaded PDF filename.")
    pdf_sha256: str = Field(description="Document hash used for duplicate detection.")
    created_at: str = Field(default="", description="ISO timestamp when the screening was created.")
    updated_at: str = Field(default="", description="ISO timestamp when the screening was last updated.")


class ScreeningIntakeResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "created",
                "document_id": "doc_123",
                "document": {
                    "id": "doc_123",
                    "original_filename": "screening.pdf",
                    "pdf_sha256": "c0ffee",
                    "file_size_bytes": 2048,
                    "mime_type": "application/pdf",
                },
                "screening": None,
                "existing_screenings": [],
                "default_reuse_screening_id": None,
            }
        }
    )

    status: ScreeningIntakeStatus = Field(description="Whether the upload created a new draft or matched an existing PDF.")
    document_id: str = Field(description="Linked deduplicated document identifier.")
    document: ScreeningDocumentSummary = Field(description="Stored document summary.")
    screening: ScreeningDetail | None = Field(default=None, description="Created screening draft for new uploads.")
    existing_screenings: list[ScreeningDuplicateItem] = Field(
        default_factory=list,
        description="Existing screenings linked to the same document when a duplicate is detected.",
    )
    default_reuse_screening_id: str | None = Field(
        default=None,
        description="Best default screening id to reopen on duplicate uploads.",
    )


class ScreeningDuplicateCreateRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"document_id": "doc_123"}})

    document_id: str = Field(description="Existing deduplicated document id to clone into a fresh screening draft.")


class ScreeningFieldPatchRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "screen_name": "Healthcare Platform Targets",
                "website": "example.com",
                "edited_fields": {"target_sector": "Healthcare IT"},
            }
        }
    )

    screen_name: str | None = Field(default=None, description="Optional top-level screen name update.")
    website: str | None = Field(default=None, description="Optional top-level website update.")
    edited_fields: dict[str, str | None] = Field(
        default_factory=dict,
        description="Partial field-value updates to merge into the editable screening payload.",
    )


class ScreeningFieldPatchResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "screening_id": "scr_123",
                "status": "draft",
                "screen_name": "Healthcare Platform Targets",
                "website": "example.com",
                "edited_fields": {"target_sector": "Healthcare IT"},
                "updated_at": "2026-04-12T10:35:00",
            }
        }
    )

    screening_id: str = Field(description="Updated screening identifier.")
    status: ScreeningStatus = Field(description="Current screening workflow status.")
    screen_name: str | None = Field(default=None, description="Persisted screen name after the patch.")
    website: str | None = Field(default=None, description="Persisted website after the patch.")
    edited_fields: dict[str, str] = Field(default_factory=dict, description="Merged edited field values.")
    updated_at: str = Field(default="", description="ISO timestamp of the latest save.")


class ScreeningStartResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "screening_id": "scr_123",
                "status": "screening_started",
                "message": "LLM step is TODO. Returning saved draft payload.",
                "payload": {"screen_name": "Healthcare Platform Targets"},
            }
        }
    )

    screening_id: str = Field(description="Started screening identifier.")
    status: ScreeningStatus = Field(description="Updated screening workflow status.")
    message: str = Field(description="Stub LLM workflow message.")
    payload: dict[str, Any] = Field(default_factory=dict, description="Stubbed LLM payload snapshot.")
