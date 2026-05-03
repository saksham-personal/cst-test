from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ListCompanyInput(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "company": "Acme Manufacturing",
                "source_keywords": ["manufacturer", "hvac"],
                "primary_key_value": "CRE-100042",
                "crescendo_id": "CRE-100042",
            }
        }
    )

    company: str = Field(description="Company display name.")
    source_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords that led to this company being added to the list.",
    )
    primary_key_value: str | None = Field(
        default=None,
        description="Canonical primary key value from the search index (Crescendo ID).",
    )
    crescendo_id: str | None = Field(
        default=None,
        description="Crescendo ID — the primary key for list membership and dedup.",
    )


class ListCompanyEntry(ListCompanyInput):
    added_at: str = Field(default="", description="ISO timestamp when the company was added to the list.")


class ListCompanyDetail(ListCompanyEntry):
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Resolved company metadata from the active search index.",
    )


class ListSummary(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Q2 Targets",
                "count": 12,
                "updated_at": "2026-04-12T10:30:00",
            }
        }
    )

    name: str = Field(description="List name.")
    count: int = Field(description="Number of companies in the list.")
    screening_id: str | None = Field(default=None, description="Optional linked screening identifier.")
    screen_name: str | None = Field(default=None, description="Optional linked screening name.")
    created_at: str = Field(default="", description="ISO timestamp when the list was created.")
    updated_at: str = Field(default="", description="ISO timestamp of the latest change.")


class ListCollectionResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "count": 1,
                "lists": [
                    {
                        "name": "Q2 Targets",
                        "count": 12,
                        "updated_at": "2026-04-12T10:30:00",
                    }
                ],
            }
        }
    )

    count: int = Field(description="Number of saved lists.")
    lists: list[ListSummary] = Field(default_factory=list, description="Saved list summaries.")


class ListDetail(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Q2 Targets",
                "created_at": "2026-04-12T10:00:00",
                "updated_at": "2026-04-12T10:30:00",
                "count": 1,
                "companies": [],
            }
        }
    )

    name: str = Field(description="List name.")
    created_at: str = Field(default="", description="ISO timestamp when the list was created.")
    updated_at: str = Field(default="", description="ISO timestamp of the latest change.")
    screening_id: str | None = Field(default=None, description="Optional linked screening identifier.")
    screen_name: str | None = Field(default=None, description="Optional linked screening name.")
    count: int = Field(default=0, description="Number of companies in the list.")
    companies: list[ListCompanyEntry] = Field(default_factory=list, description="Companies stored in the list.")


class ListCreateRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"name": "Q2 Targets"}})

    name: str = Field(description="Unique list name.")
    screening_id: str | None = Field(default=None, description="Optional screening id to associate the list with.")
    screen_name: str | None = Field(default=None, description="Optional screening name to cache with the list.")


class ListCreateResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "item": {
                    "name": "Q2 Targets",
                    "created_at": "2026-04-12T10:00:00",
                    "updated_at": "2026-04-12T10:00:00",
                    "count": 0,
                    "companies": [],
                }
            }
        }
    )

    item: ListDetail = Field(description="Created list detail.")


class ListAddCompaniesRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "companies": [
                    {
                        "company": "Acme Manufacturing",
                        "primary_key_value": "CRE-100042",
                        "crescendo_id": "CRE-100042",
                        "source_keywords": ["manufacturer"],
                    }
                ]
            }
        }
    )

    companies: list[ListCompanyInput] = Field(
        default_factory=list,
        description="Companies to add or merge into the target list.",
    )


ListCompaniesRequest = ListAddCompaniesRequest


class ListAddFromSearchRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "search_id": "f3a1e88c12ef4b28b9c3d1f0a7ce9bcd",
                "source_keywords": ["manufacturer", "hvac"],
            }
        }
    )

    search_id: str = Field(description="Opaque search id returned by /search/execute.")
    source_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords to annotate every added company with.",
    )


class ListRemoveCompaniesRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "company_names": ["CRE-100042", "CRE-100043"],
            }
        }
    )

    company_names: list[str] = Field(
        default_factory=list,
        description="Identifiers to remove — Crescendo IDs preferred; company names accepted for legacy entries.",
    )


class ListCopyCompaniesRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "target_list_name": "Q3 Targets",
                "company_names": ["CRE-100042"],
            }
        }
    )

    target_list_name: str = Field(description="Destination list name.")
    company_names: list[str] = Field(
        default_factory=list,
        description="Identifiers to copy — Crescendo IDs preferred; company names accepted for legacy entries.",
    )


class ListMutationResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "list_name": "Q2 Targets",
                "exists": True,
                "count": 12,
                "added": 1,
                "skipped": 0,
                "removed": 0,
                "copied": 0,
                "updated_at": "2026-04-12T10:30:00",
                "companies": [],
                "detail": {},
            }
        }
    )

    list_name: str = Field(description="Affected list name.")
    exists: bool = Field(default=True, description="Whether the target list already existed.")
    count: int = Field(default=0, description="Company count after the mutation.")
    added: int = Field(default=0, description="Number of companies added.")
    skipped: int = Field(default=0, description="Number of duplicate companies skipped.")
    removed: int = Field(default=0, description="Number of companies removed.")
    copied: int = Field(default=0, description="Number of companies copied.")
    updated_at: str = Field(default="", description="ISO timestamp of the latest change.")
    companies: list[ListCompanyEntry] = Field(default_factory=list, description="Updated company entries.")
    detail: dict[str, Any] = Field(default_factory=dict, description="Full list detail payload.")


class ListRemoveCompanyResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "list_name": "Q2 Targets",
                "company_name": "Acme Manufacturing",
                "removed": True,
                "count": 11,
                "updated_at": "2026-04-12T10:30:00",
            }
        }
    )

    list_name: str = Field(description="Affected list name.")
    company_name: str = Field(description="Removed company name.")
    removed: bool = Field(description="Whether the company was removed.")
    count: int = Field(default=0, description="Company count after removal.")
    updated_at: str = Field(default="", description="ISO timestamp of the latest change.")


class ListDeleteResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "list_name": "Q2 Targets",
                "deleted": True,
            }
        }
    )

    list_name: str = Field(description="Deleted list name.")
    deleted: bool = Field(description="Whether the list was deleted.")
