from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query, Depends, Path
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_export_service
from app.services.exports import ExportService, ExportArtifact

router = APIRouter(prefix="/exports", tags=["exports"])


def _download_response(artifact: ExportArtifact) -> StreamingResponse:
    headers = {
        "Content-Disposition": f'attachment; filename="{artifact.filename}"',
    }
    return StreamingResponse(artifact.iter_chunks(), media_type=artifact.media_type, headers=headers)


@router.get(
    "/search/{search_id}",
    response_class=StreamingResponse,
    summary="Export a cached search result set",
    description=(
        "Generate a CSV or XLSX export from a previously executed search. "
        "The export reuses the cached search record, so the search must still be present in memory."
    ),
    response_description="A downloadable CSV or XLSX file.",
    operation_id="exportSearchGet",
)
def export_search_get(
    search_id: str = Path(..., description="Opaque search identifier returned by /search/execute."),
    format: str = Query("xlsx", description="Format: csv or xlsx"),
    include_highlights: bool = Query(False),
    include_metadata: bool = Query(True),
    highlight_limit: int = Query(50),
    layout: str = Query("standard"),
    service: ExportService = Depends(get_export_service),
) -> StreamingResponse:
    artifact = service.export_search(
        search_id,
        format=format,
        include_highlights=include_highlights,
        include_metadata=include_metadata,
        highlight_limit=highlight_limit,
        layout=layout,
    )
    return _download_response(artifact)


@router.get(
    "/lists/{list_name}",
    response_class=StreamingResponse,
    summary="Export a saved company list",
    description="Generate a CSV or XLSX export for a persisted company list.",
    response_description="A downloadable CSV or XLSX file.",
    operation_id="exportListGet",
)
def export_list_get(
    list_name: str = Path(..., description="Saved list name."),
    format: str = Query("xlsx", description="Format: csv or xlsx"),
    include_metadata: bool = Query(True),
    layout: str = Query("standard"),
    service: ExportService = Depends(get_export_service),
) -> StreamingResponse:
    artifact = service.export_list(
        list_name,
        format=format,
        include_metadata=include_metadata,
        layout=layout,
    )
    return _download_response(artifact)

