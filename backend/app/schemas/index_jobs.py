from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


IndexJobSourceType = Literal["path", "upload"]
IndexJobState = Literal["queued", "running", "completed", "failed", "activating", "activated", "cancelled"]


class IndexJobCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "source_type": "path",
                "xlsx_path": "E:\\data\\master_companies.xlsx",
                "output_bundle_name": "q2_targets",
                "activate_on_success": True,
            }
        }
    )

    source_type: IndexJobSourceType = Field(description="Where the workbook comes from.")
    xlsx_path: str | None = Field(
        default=None,
        description="Local workbook path used when source_type is 'path'.",
    )
    output_bundle_name: str | None = Field(
        default=None,
        description="Friendly bundle name for the generated index bundle.",
    )
    activate_on_success: bool = Field(
        default=False,
        description="Automatically activate the bundle after the build completes.",
    )


class IndexJobUploadResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": "idx_123",
                "source_type": "upload",
                "state": "running",
                "stage": "reading_excel",
                "percent": 12,
                "message": "Reading Excel file 'master_companies.xlsx'",
                "output_bundle_name": "q2_targets",
                "output_dir": "E:/company-screener/index_bundles/q2_targets_1a2b3c4d",
                "activate_on_success": True,
            }
        }
    )

    job_id: str
    source_type: IndexJobSourceType
    state: IndexJobState
    stage: str = Field(default="queued")
    percent: int = Field(default=0, ge=0, le=100)
    message: str = Field(default="")
    current: int | None = Field(default=None)
    total: int | None = Field(default=None)
    eta_seconds: float | None = Field(default=None)
    source_path: str | None = Field(default=None)
    source_filename: str | None = Field(default=None)
    output_bundle_name: str = Field(default="")
    output_dir: str = Field(default="")
    activate_on_success: bool = Field(default=False)
    created_at: str = Field(default="")
    updated_at: str = Field(default="")
    started_at: str | None = Field(default=None)
    completed_at: str | None = Field(default=None)
    activated_at: str | None = Field(default=None)
    pid: int | None = Field(default=None)
    exit_code: int | None = Field(default=None)
    error: str | None = Field(default=None)
    bundle_ready: bool = Field(default=False)
    timings_ms: dict[str, float] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)


class IndexJobDetail(IndexJobUploadResponse):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": "idx_123",
                "source_type": "path",
                "state": "completed",
                "stage": "completed",
                "percent": 100,
                "message": "Index bundle built at E:/company-screener/index_bundles/q2_targets_1a2b3c4d",
                "current": 200000,
                "total": 200000,
                "eta_seconds": 0,
                "source_path": "E:/data/master_companies.xlsx",
                "output_bundle_name": "q2_targets",
                "output_dir": "E:/company-screener/index_bundles/q2_targets_1a2b3c4d",
                "activate_on_success": True,
                "created_at": "2026-04-12T11:40:00",
                "updated_at": "2026-04-12T11:42:31",
                "started_at": "2026-04-12T11:40:02",
                "completed_at": "2026-04-12T11:42:31",
                "activated_at": "2026-04-12T11:42:34",
                "pid": 42396,
                "exit_code": 0,
                "error": None,
                "bundle_ready": True,
                "timings_ms": {"build": 132000.0},
                "details": {"progress_stage": "completed"},
            }
        }
    )


class IndexJobCollectionResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "count": 1,
                "jobs": [],
            }
        }
    )

    count: int = Field(description="Number of persisted jobs.")
    jobs: list[IndexJobDetail] = Field(default_factory=list)
