from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.services.exports import ExportService
from app.services.index_jobs import IndexJobService
from app.services.history import HistoryService
from app.services.lists import ListsService
from app.services.keywords import KeywordsService
from app.services.screenings import ScreeningsService
from app.services.search import SearchService


def get_request_settings(request: Request) -> Settings:
    settings = getattr(request.app.state, "settings", None)
    if isinstance(settings, Settings):
        return settings
    return get_settings()


def pagination_params(
    request: Request,
    page: int = 1,
    page_size: int = 100,
) -> tuple[int, int]:
    settings = get_request_settings(request)
    safe_page = max(1, page)
    safe_page_size = min(max(1, page_size), settings.max_page_size)
    return safe_page, safe_page_size


def settings_dependency(settings: Settings = Depends(get_settings)) -> Settings:
    return settings


def iter_cors_origins(settings: Settings = Depends(get_settings)) -> Iterator[str]:
    yield from settings.cors_origins


def get_search_service(request: Request) -> SearchService:
    service = getattr(request.app.state, "search_service", None)
    if isinstance(service, SearchService):
        return service

    settings = get_request_settings(request)
    service = SearchService(settings)
    request.app.state.search_service = service
    return service


def get_history_service(request: Request) -> HistoryService:
    service = getattr(request.app.state, "history_service", None)
    if isinstance(service, HistoryService):
        return service

    settings = get_request_settings(request)
    service = HistoryService(settings)
    request.app.state.history_service = service
    return service


def get_lists_service(request: Request) -> ListsService:
    service = getattr(request.app.state, "lists_service", None)
    if isinstance(service, ListsService):
        return service

    settings = get_request_settings(request)
    service = ListsService(settings)
    request.app.state.lists_service = service
    return service


def get_keyword_service(request: Request) -> KeywordsService:
    service = getattr(request.app.state, "keyword_service", None)
    if isinstance(service, KeywordsService):
        return service

    service = KeywordsService()
    request.app.state.keyword_service = service
    return service


def get_export_service(request: Request) -> ExportService:
    service = getattr(request.app.state, "export_service", None)
    if isinstance(service, ExportService):
        return service

    search_service = get_search_service(request)
    lists_service = get_lists_service(request)
    service = ExportService(search_service, lists_service)
    request.app.state.export_service = service
    return service


def get_index_job_service(request: Request) -> IndexJobService:
    service = getattr(request.app.state, "index_job_service", None)
    if isinstance(service, IndexJobService):
        return service

    settings = get_request_settings(request)
    search_service = get_search_service(request)
    service = IndexJobService(settings, search_service)
    request.app.state.index_job_service = service
    return service


def get_screenings_service(request: Request) -> ScreeningsService:
    service = getattr(request.app.state, "screenings_service", None)
    if isinstance(service, ScreeningsService):
        return service

    settings = get_request_settings(request)
    service = ScreeningsService(settings)
    request.app.state.screenings_service = service
    return service
