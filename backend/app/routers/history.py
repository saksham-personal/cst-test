from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.core.dependencies import get_history_service
from app.schemas.history import (
    SearchHistoryClearResponse,
    SearchHistoryEntry,
    SearchHistoryRecordRequest,
    SearchHistoryResponse,
)
from app.services.history import HistoryService

router = APIRouter(prefix="/history", tags=["history"])


@router.get(
    "",
    response_model=SearchHistoryResponse,
    summary="List recent searches",
    description="Return the most recent search history entries stored on disk.",
    response_description="A collection of recent search history records.",
    operation_id="listHistory",
)
def list_history(service: HistoryService = Depends(get_history_service)) -> SearchHistoryResponse:
    return service.list_history()


@router.post(
    "",
    response_model=SearchHistoryEntry,
    summary="Record a search history entry",
    description="Persist a search history entry and return the stored record.",
    response_description="The stored search history entry.",
    operation_id="recordHistory",
)
def record_history(
    payload: SearchHistoryRecordRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Record a completed search",
                "value": {
                    "keywords": [
                        {
                            "serial": 1,
                            "keyword": "manufacturer",
                            "mode": "lexical",
                            "action": "include",
                            "weight": 1,
                        }
                    ],
                    "query_expression": "1",
                    "parsed_query": "#1:\"manufacturer\"",
                    "search_mode": "expression",
                    "result_count": 169648,
                    "page": 1,
                    "page_size": 25,
                    "include_highlights": False,
                    "include_metadata": True,
                    "keyword_hit_counts": {"manufacturer": 169648},
                },
            }
        },
    ),
    service: HistoryService = Depends(get_history_service),
) -> SearchHistoryEntry:
    return service.record_search(payload)


@router.delete(
    "",
    response_model=SearchHistoryClearResponse,
    summary="Clear search history",
    description="Remove all persisted search history entries.",
    response_description="A confirmation that history was cleared.",
    operation_id="clearHistory",
)
def clear_history(service: HistoryService = Depends(get_history_service)) -> SearchHistoryClearResponse:
    return service.clear_history()
