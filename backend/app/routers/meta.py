from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import Settings
from app.core.dependencies import get_search_service, settings_dependency
from app.schemas.meta import CapabilitiesResponse, ConfigResponse, HealthResponse, MetaResponse
from app.services.search import SearchService

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Return a lightweight status payload showing whether the index bundle is available.",
    response_description="Health information for the backend service.",
    operation_id="getMetaHealth",
)
def health(settings: Settings = Depends(settings_dependency)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        index_loaded=settings.index_exists,
        app_name=settings.app_name,
        environment=settings.environment,
    )


@router.get(
    "",
    response_model=MetaResponse,
    summary="Backend metadata",
    description=(
        "Return the current backend and index metadata, including the configured primary key "
        "and the display name column."
    ),
    response_description="Backend and index metadata.",
    operation_id="getMeta",
)
def meta(
    settings: Settings = Depends(settings_dependency),
    service: SearchService = Depends(get_search_service),
) -> MetaResponse:
    return MetaResponse(
        app_name=settings.app_name,
        api_version="v1",
        environment=settings.environment,
        index_dir=settings.index_dir,
        index_loaded=settings.index_exists,
        primary_key=service.primary_key,
        company_name_col=service.company_name_col,
    )


@router.get(
    "/config",
    response_model=ConfigResponse,
    summary="Runtime configuration",
    description=(
        "Return the documented backend settings that influence request handling, pagination, "
        "and search cache behavior."
    ),
    response_description="Backend configuration details.",
    operation_id="getMetaConfig",
)
def config(settings: Settings = Depends(settings_dependency)) -> ConfigResponse:
    return ConfigResponse(
        app_name=settings.app_name,
        api_v1_prefix=settings.api_v1_prefix,
        environment=settings.environment,
        index_dir=settings.index_dir,
        index_loaded=settings.index_exists,
        scoring_ext_path=settings.scoring_ext_path,
        lists_dir=settings.lists_dir,
        search_history_path=settings.search_history_path,
        index_jobs_dir=settings.index_jobs_dir,
        index_bundles_dir=settings.index_bundles_dir,
        index_uploads_dir=settings.index_uploads_dir,
        active_index_state_path=settings.active_index_state_path,
        default_page_size=settings.default_page_size,
        max_page_size=settings.max_page_size,
        search_cache_max_entries=settings.search_cache_max_entries,
        search_cache_ttl_seconds=settings.search_cache_ttl_seconds,
        search_history_max_entries=settings.search_history_max_entries,
        list_name_max_length=settings.list_name_max_length,
        max_thread_workers=settings.max_thread_workers,
        request_timeout_seconds=settings.request_timeout_seconds,
        cors_origins=settings.cors_origins,
    )


@router.get(
    "/capabilities",
    response_model=CapabilitiesResponse,
    summary="Search capabilities",
    description=(
        "Describe the active search bundle and feature support, including quoted exact matching "
        "and the scoring mode."
    ),
    response_description="Feature and index capability information.",
    operation_id="getMetaCapabilities",
)
def capabilities(service: SearchService = Depends(get_search_service)) -> CapabilitiesResponse:
    return CapabilitiesResponse(**service.capabilities())
