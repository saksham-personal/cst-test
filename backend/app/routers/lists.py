from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Path, Query

from app.core.dependencies import get_lists_service, get_search_service
from app.core.errors import NotFoundError
from app.schemas.lists import (
    ListAddCompaniesRequest,
    ListAddFromSearchRequest,
    ListCollectionResponse,
    ListCompanyDetail,
    ListCopyCompaniesRequest,
    ListCreateRequest,
    ListCreateResponse,
    ListDeleteResponse,
    ListDetail,
    ListMutationResponse,
    ListRemoveCompaniesRequest,
    ListRemoveCompanyResponse,
)
from app.services.lists import ListsService
from app.services.search import SearchService

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get(
    "",
    response_model=ListCollectionResponse,
    summary="List saved company lists",
    description="Return summaries for every persisted list on disk, optionally filtered by screening id.",
)
def list_lists(
    screening_id: str | None = Query(
        default=None,
        description="Optional screening id to filter lists by. Use __none__ for lists without an associated screen.",
    ),
    service: ListsService = Depends(get_lists_service),
) -> ListCollectionResponse:
    return service.list_lists(screening_id)


@router.post(
    "",
    response_model=ListCreateResponse,
    summary="Create a list",
    description="Create a new empty named list.",
)
def create_list(
    payload: ListCreateRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Create an empty list",
                "value": {
                    "name": "Q2 Targets",
                },
            }
        },
    ),
    service: ListsService = Depends(get_lists_service),
) -> ListCreateResponse:
    return service.create_list(payload)


@router.get(
    "/{list_name}",
    response_model=ListDetail,
    summary="Get a list",
    description="Return the full detail for one saved list, including companies.",
)
def get_list(
    list_name: str = Path(..., description="Saved list name."),
    service: ListsService = Depends(get_lists_service),
) -> ListDetail:
    return service.get_list(list_name)


@router.get(
    "/{list_name}/companies/{company_key}",
    response_model=ListCompanyDetail,
    summary="Get one saved-list company",
    description="Return one saved-list company enriched with metadata from the active search index.",
)
def get_list_company_detail(
    list_name: str = Path(..., description="Saved list name."),
    company_key: str = Path(..., description="Crescendo ID or company name for the saved entry."),
    lists_service: ListsService = Depends(get_lists_service),
    search_service: SearchService = Depends(get_search_service),
) -> ListCompanyDetail:
    detail = lists_service.get_list(list_name)
    wanted = company_key.strip()
    for company in detail.companies:
        aliases = {
            alias.strip()
            for alias in (company.primary_key_value, company.crescendo_id, company.company)
            if alias and alias.strip()
        }
        if wanted in aliases:
            metadata_key = company.primary_key_value or company.crescendo_id or ""
            return ListCompanyDetail(**company.model_dump(), metadata=search_service.get_company_metadata(metadata_key))
    raise NotFoundError(f"Company '{company_key}' was not found in list '{list_name}'.")


@router.delete(
    "/{list_name}",
    response_model=ListDeleteResponse,
    summary="Delete a list",
    description="Delete a saved list and all of its entries.",
)
def delete_list(
    list_name: str = Path(..., description="Saved list name."),
    service: ListsService = Depends(get_lists_service),
) -> ListDeleteResponse:
    return service.delete_list(list_name)


@router.post(
    "/{list_name}/companies",
    response_model=ListMutationResponse,
    summary="Add companies to a list",
    description=(
        "Append one or more companies to a saved list. Existing companies are deduplicated "
        "by company name and source keywords are merged."
    ),
)
def add_companies_to_list(
    payload: ListAddCompaniesRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Append companies to a saved list",
                "value": {
                    "companies": [
                        {
                            "company": "Acme Manufacturing",
                            "primary_key_value": "Acme Manufacturing",
                            "source_keywords": ["manufacturer", "hvac"],
                        }
                    ],
                },
            }
        },
    ),
    list_name: str = Path(..., description="Saved list name."),
    service: ListsService = Depends(get_lists_service),
) -> ListMutationResponse:
    return service.add_companies(list_name, payload)


@router.post(
    "/{list_name}/companies-from-search",
    response_model=ListMutationResponse,
    summary="Add every company from a cached search to a list",
    description=(
        "Server-side 'select all + add to list' — resolves the full cached result set "
        "behind `search_id` and appends every row to the target list. Deduplicated by "
        "Crescendo ID on insert, so re-adding is safe."
    ),
)
def add_companies_from_search(
    payload: ListAddFromSearchRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Add every row from a search to a list",
                "value": {
                    "search_id": "f3a1e88c12ef4b28b9c3d1f0a7ce9bcd",
                    "source_keywords": ["manufacturer", "hvac"],
                },
            }
        },
    ),
    list_name: str = Path(..., description="Saved list name."),
    lists_service: ListsService = Depends(get_lists_service),
    search_service: SearchService = Depends(get_search_service),
) -> ListMutationResponse:
    record = search_service.get_search_record(payload.search_id)
    if record is None:
        raise NotFoundError(f"Search '{payload.search_id}' not found or has expired.")

    source_keywords = [str(k).strip() for k in (payload.source_keywords or []) if str(k).strip()]
    companies = []
    for row in record.results:
        pk = str(row.get("primary_key_value", "")).strip()
        if not pk:
            continue
        display_name = search_service.engine.get_company_name(pk) or pk
        companies.append(
            {
                "company": display_name,
                "primary_key_value": pk,
                "crescendo_id": pk,
                "source_keywords": source_keywords,
            }
        )
    return lists_service.add_companies(list_name, {"companies": companies})


@router.post(
    "/{list_name}/copy",
    response_model=ListMutationResponse,
    summary="Copy companies to another list",
    description=(
        "Copy selected companies from one saved list into another saved list. "
        "Existing companies in the target list are deduplicated by company name and "
        "source keywords are merged."
    ),
)
def copy_companies_between_lists(
    payload: ListCopyCompaniesRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Copy selected companies into another list",
                "value": {
                    "target_list_name": "Q3 Targets",
                    "company_names": ["Acme Manufacturing", "Beta Holdings"],
                },
            }
        },
    ),
    list_name: str = Path(..., description="Source list name."),
    service: ListsService = Depends(get_lists_service),
) -> ListMutationResponse:
    return service.copy_companies(list_name, payload)


@router.delete(
    "/{list_name}/companies",
    response_model=ListMutationResponse,
    summary="Remove companies from a list",
    description="Remove one or more companies from a saved list by company name.",
)
def remove_companies_from_list(
    payload: ListRemoveCompaniesRequest = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Remove multiple companies from a saved list",
                "value": {
                    "company_names": ["Acme Manufacturing", "Beta Holdings"],
                },
            }
        },
    ),
    list_name: str = Path(..., description="Saved list name."),
    service: ListsService = Depends(get_lists_service),
) -> ListMutationResponse:
    return service.remove_companies(list_name, payload)


@router.delete(
    "/{list_name}/companies/{company_name}",
    response_model=ListRemoveCompanyResponse,
    summary="Remove one company from a list",
    description="Convenience endpoint for removing a single company from a saved list.",
)
def remove_company_from_list(
    list_name: str = Path(..., description="Saved list name."),
    company_name: str = Path(..., description="Company name to remove."),
    service: ListsService = Depends(get_lists_service),
) -> ListRemoveCompanyResponse:
    return service.remove_company(list_name, company_name)
