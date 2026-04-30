from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Path, Query
from pydantic import BaseModel, Field

from app.core.dependencies import get_search_service, pagination_params
from app.schemas.search import SearchExecuteRequest, SearchPageResponse
from app.services.search import SearchService

router = APIRouter(prefix="/search", tags=["search"])


class SearchPageRequest(BaseModel):
    """POST body for /search/{search_id}/page — supports sort, per-column filter, and quick filter."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1)
    include_highlights: bool = Field(default=False)
    include_metadata: bool = Field(default=True)
    quick_filter: str | None = Field(default=None, description="Case-insensitive substring across company name + metadata + matched keywords.")
    filter_model: dict[str, Any] | None = Field(default=None, description="AG Grid filter model keyed by colId.")
    sort_model: list[dict[str, Any]] | None = Field(default=None, description="AG Grid sort model (list of {colId, sort}).")


@router.post(
    "/execute",
    response_model=SearchPageResponse,
    summary="Execute a search",
    description=(
        "Run a default or expression-mode search and return the first page of results. "
        "The response includes a search_id that can be reused to fetch additional pages."
    ),
    response_description="The first page of search results and the cache key for paging.",
    operation_id="executeSearch",
)
def execute_search(
    payload: SearchExecuteRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Default soft-AND search",
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
                    "query_expression": "",
                    "page": 1,
                    "page_size": 25,
                    "include_highlights": True,
                    "include_metadata": True,
                },
            },
            "expression": {
                "summary": "Boolean expression search",
                "value": {
                    "keywords": [
                        {
                            "serial": 1,
                            "keyword": "manufacturer",
                            "mode": "lexical",
                            "action": "include",
                            "weight": 1,
                        },
                        {
                            "serial": 2,
                            "keyword": "hvac",
                            "mode": "lexical",
                            "action": "include",
                            "weight": 1,
                        },
                    ],
                    "query_expression": "1 OR 2",
                    "page": 1,
                    "page_size": 25,
                    "include_highlights": False,
                    "include_metadata": True,
                },
            },
        },
    ),
    service: SearchService = Depends(get_search_service),
) -> SearchPageResponse:
    return service.execute_search(payload)


@router.get(
    "/{search_id}",
    response_model=SearchPageResponse,
    summary="Fetch a cached search",
    description=(
        "Return a cached search result page using the search_id returned by /search/execute. "
        "This endpoint is a convenience alias for /search/{search_id}/page."
    ),
    response_description="A cached page of search results.",
    operation_id="getSearch",
)
def get_search(
    search_id: str = Path(..., description="Opaque search identifier returned by /search/execute."),
    service: SearchService = Depends(get_search_service),
    page_and_size: tuple[int, int] = Depends(pagination_params),
) -> SearchPageResponse:
    page, page_size = page_and_size
    return service.get_search_page(search_id, page=page, page_size=page_size)


@router.get(
    "/{search_id}/page",
    response_model=SearchPageResponse,
    summary="Fetch a search page",
    description=(
        "Return a page of results from a previously executed search. "
        "Set include_highlights to hydrate snippets for the requested page."
    ),
    response_description="A paginated slice of a cached search.",
    operation_id="getSearchPage",
)
def get_search_page(
    search_id: str = Path(..., description="Opaque search identifier returned by /search/execute."),
    page: int = Query(1, ge=1, description="1-based page number to retrieve."),
    page_size: int = Query(100, ge=1, description="Number of rows to return."),
    include_highlights: bool = Query(False, description="Hydrate highlight snippets for the requested page."),
    include_metadata: bool = Query(True, description="Include company metadata columns in the response."),
    service: SearchService = Depends(get_search_service),
) -> SearchPageResponse:
    return service.get_search_page(
        search_id,
        page=page,
        page_size=page_size,
        include_highlights=include_highlights,
        include_metadata=include_metadata,
    )


@router.post(
    "/{search_id}/page",
    response_model=SearchPageResponse,
    summary="Fetch a search page with sort/filter state",
    description=(
        "Server-side paging with optional AG Grid sort model, per-column filter model, "
        "and quick filter string. This is the endpoint used by the interactive results grid "
        "so column header sorting, per-column filters, and the toolbar quick filter all "
        "operate against the full cached result set instead of just the currently-loaded page."
    ),
    response_description="A paginated slice of a cached search after server-side sort/filter.",
    operation_id="searchPage",
)
def search_page(
    search_id: str = Path(..., description="Opaque search identifier returned by /search/execute."),
    payload: SearchPageRequest = Body(...),
    service: SearchService = Depends(get_search_service),
) -> SearchPageResponse:
    return service.get_search_page(
        search_id,
        page=payload.page,
        page_size=payload.page_size,
        include_highlights=payload.include_highlights,
        include_metadata=payload.include_metadata,
        quick_filter=payload.quick_filter,
        filter_model=payload.filter_model,
        sort_model=payload.sort_model,
    )


@router.get(
    "/{search_id}/highlights",
    response_model=SearchPageResponse,
    summary="Fetch highlights for a search page",
    description=(
        "Return a page of results with highlights enabled. This is useful for a UI that wants "
        "snippet hydration separate from the initial search call."
    ),
    response_description="A paginated slice of a cached search with highlights included.",
    operation_id="getSearchHighlights",
)
def get_search_highlights(
    search_id: str = Path(..., description="Opaque search identifier returned by /search/execute."),
    page: int = Query(1, ge=1, description="1-based page number to retrieve."),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows to return for highlighting."),
    service: SearchService = Depends(get_search_service),
) -> SearchPageResponse:
    return service.get_search_page(
        search_id,
        page=page,
        page_size=page_size,
        include_highlights=True,
        include_metadata=True,
    )
