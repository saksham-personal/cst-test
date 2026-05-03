from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, Path, UploadFile
from fastapi.responses import FileResponse

from app.core.dependencies import get_screenings_service
from app.schemas.screenings import (
    ScreeningDetail,
    ScreeningDuplicateCreateRequest,
    ScreeningFieldPatchRequest,
    ScreeningFieldPatchResponse,
    ScreeningIntakeResponse,
    ScreeningStartResponse,
    ScreeningSummary,
)
from app.services.screenings import ScreeningsService

router = APIRouter(prefix="/screenings", tags=["screenings"])


@router.get(
    "",
    response_model=list[ScreeningSummary],
    summary="List screenings",
    description="Return screening summaries for dropdowns, routing, and active-screen context.",
)
def list_screenings(service: ScreeningsService = Depends(get_screenings_service)) -> list[ScreeningSummary]:
    return service.list_screenings()


@router.get(
    "/active",
    response_model=ScreeningDetail,
    summary="Get the active screening",
    description="Return the currently active screening used to gate downstream workflow steps.",
)
def get_active_screening(service: ScreeningsService = Depends(get_screenings_service)) -> ScreeningDetail:
    return service.get_active_screening()


@router.post(
    "/intake",
    response_model=ScreeningIntakeResponse,
    summary="Upload a screening PDF",
    description="Upload a PDF form, deduplicate it by hash, and create or reuse a screening draft.",
)
def intake_screening_pdf(
    file: UploadFile = File(..., description="PDF form to upload for screening intake."),
    service: ScreeningsService = Depends(get_screenings_service),
) -> ScreeningIntakeResponse:
    return service.intake_pdf_upload(file)


@router.post(
    "/intake/duplicate-create",
    response_model=ScreeningDetail,
    summary="Create a new screening draft from an existing document",
    description="Clone the extracted payload from an existing deduplicated PDF into a fresh screening draft.",
)
def create_duplicate_screening(
    payload: ScreeningDuplicateCreateRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Clone an existing deduplicated PDF into a new draft",
                "value": {"document_id": "doc_123"},
            }
        },
    ),
    service: ScreeningsService = Depends(get_screenings_service),
) -> ScreeningDetail:
    return service.create_duplicate_screening(payload)


@router.get(
    "/{screening_id}",
    response_model=ScreeningDetail,
    summary="Get one screening draft",
    description="Return the full editable state for a screening draft or started screening.",
)
def get_screening(
    screening_id: str = Path(..., description="Screening identifier."),
    service: ScreeningsService = Depends(get_screenings_service),
) -> ScreeningDetail:
    return service.get_screening(screening_id)


@router.patch(
    "/{screening_id}/fields",
    response_model=ScreeningFieldPatchResponse,
    summary="Patch screening fields",
    description="Autosave top-level screening values or editable extracted fields.",
)
def patch_screening_fields(
    payload: ScreeningFieldPatchRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Autosave a screening field",
                "value": {
                    "screen_name": "Healthcare Platform Targets",
                    "edited_fields": {"target_sector": "Healthcare IT"},
                },
            }
        },
    ),
    screening_id: str = Path(..., description="Screening identifier."),
    service: ScreeningsService = Depends(get_screenings_service),
) -> ScreeningFieldPatchResponse:
    return service.patch_screening(screening_id, payload)


@router.get(
    "/{screening_id}/pdf",
    summary="Get the stored PDF for a screening",
    description="Stream the deduplicated stored PDF used by a screening draft.",
)
def get_screening_pdf(
    screening_id: str = Path(..., description="Screening identifier."),
    service: ScreeningsService = Depends(get_screenings_service),
) -> FileResponse:
    pdf_path = service.get_pdf_path(screening_id)
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=pdf_path.name,
        content_disposition_type="inline",
    )


@router.post(
    "/{screening_id}/start",
    response_model=ScreeningStartResponse,
    summary="Start the screening stub workflow",
    description="Validate the draft and return the saved payload to the placeholder LLM workflow.",
)
def start_screening(
    screening_id: str = Path(..., description="Screening identifier."),
    service: ScreeningsService = Depends(get_screenings_service),
) -> ScreeningStartResponse:
    return service.start_screening(screening_id)
