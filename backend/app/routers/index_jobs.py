from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, Form, Path, UploadFile

from app.core.dependencies import get_index_job_service
from app.schemas.index_jobs import IndexJobCollectionResponse, IndexJobCreateRequest, IndexJobDetail
from app.services.index_jobs import IndexJobService

router = APIRouter(prefix="/index-jobs", tags=["index-jobs"])


@router.get(
    "",
    response_model=IndexJobCollectionResponse,
    summary="List index build jobs",
    description="Return persisted index build jobs ordered by most recently updated.",
    operation_id="listIndexJobs",
)
def list_index_jobs(
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobCollectionResponse:
    return service.list_jobs()


@router.get(
    "/{job_id}",
    response_model=IndexJobDetail,
    summary="Get an index build job",
    description="Return the latest persisted state for one index build job.",
    operation_id="getIndexJob",
)
def get_index_job(
    job_id: str = Path(..., description="Index build job identifier."),
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobDetail:
    return service.get_job(job_id)


@router.post(
    "",
    response_model=IndexJobDetail,
    summary="Create an index build job from a workbook path",
    description=(
        "Queue a background index build using a local .xlsx path. "
        "The job runs in a subprocess and can be polled for progress."
    ),
    operation_id="createIndexJob",
)
def create_index_job(
    payload: IndexJobCreateRequest = Body(
        ...,
        openapi_examples={
            "path": {
                "summary": "Build index from a local workbook path",
                "value": {
                    "source_type": "path",
                    "xlsx_path": "E:\\data\\master_companies.xlsx",
                    "output_bundle_name": "q2_targets",
                    "activate_on_success": True,
                },
            }
        },
    ),
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobDetail:
    return service.create_job_from_request(payload)


@router.post(
    "/upload",
    response_model=IndexJobDetail,
    summary="Create an index build job from an uploaded workbook",
    description="Upload a .xlsx workbook and queue a background index build job.",
    operation_id="uploadIndexJob",
)
def upload_index_job(
    file: UploadFile = File(..., description="Workbook to upload and index."),
    output_bundle_name: str | None = Form(
        default=None,
        description="Friendly bundle name to use for the built index.",
    ),
    activate_on_success: bool = Form(
        default=False,
        description="Automatically activate the new bundle after the build completes.",
    ),
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobDetail:
    return service.create_job_from_upload(
        file,
        output_bundle_name=output_bundle_name,
        activate_on_success=activate_on_success,
    )


@router.post(
    "/{job_id}/cancel",
    response_model=IndexJobDetail,
    summary="Cancel an index build job",
    description="Cancel a queued or running index build job and mark it as cancelled.",
    operation_id="cancelIndexJob",
)
def cancel_index_job(
    job_id: str = Path(..., description="Index build job identifier."),
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobDetail:
    return service.cancel_job(job_id)


@router.post(
    "/{job_id}/activate",
    response_model=IndexJobDetail,
    summary="Activate a completed index bundle",
    description="Switch the backend search runtime to the bundle built by the specified job.",
    operation_id="activateIndexJob",
)
def activate_index_job(
    job_id: str = Path(..., description="Index build job identifier."),
    service: IndexJobService = Depends(get_index_job_service),
) -> IndexJobDetail:
    return service.activate_job(job_id)
