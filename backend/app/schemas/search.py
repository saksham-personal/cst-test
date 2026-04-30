from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class KeywordInput(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "serial": 1,
                "keyword": "manufacturer",
                "mode": "lexical",
                "action": "include",
                "weight": 1,
            }
        }
    )

    serial: int | None = Field(
        default=None,
        description="User-assigned keyword number used by boolean expressions and imports.",
    )
    keyword: str = Field(
        default="",
        description="Keyword text as entered by the analyst. Quotes are preserved by the parser for exact search.",
    )
    mode: Literal["lexical", "semantic"] = Field(
        default="lexical",
        description="Search mode for this keyword. Lexical is the default runtime mode.",
    )
    action: Literal["include", "exclude"] = Field(
        default="include",
        description="Whether the keyword contributes to results or removes matching companies.",
    )
    weight: int = Field(
        default=1,
        ge=1,
        description="Relative keyword weight used by the scorer.",
    )


class MatchSnippet(BaseModel):
    source: str
    keyword: str
    match_type: str
    sentence: str
    context_before: str = ""
    context_after: str = ""


class SearchResultRow(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "primary_key_value": "Acme Manufacturing",
                "company_name": "Acme Manufacturing",
                "rowid": 12345,
                "relevance": 0.42,
                "completeness": 1.0,
                "composite_score": 0.42,
                "keywords_matched": 1,
                "n_keywords": 1,
                "matched_keywords": ["manufacturer"],
                "matched_serials": [1],
                "matches": [],
                "metadata": {"Company": "Acme Manufacturing"},
            }
        }
    )

    primary_key_value: str = Field(description="Primary key value for the company row.")
    company_name: str | None = Field(default=None, description="Display name for the company, if available.")
    rowid: int | None = Field(default=None, description="Internal SQLite rowid for the matched company.")
    relevance: float = Field(default=0.0, description="Ranking contribution from keyword relevance.")
    completeness: float = Field(default=0.0, description="Fraction of included keywords matched.")
    composite_score: float = Field(default=0.0, description="Primary ordering score shown to the user.")
    keywords_matched: int = Field(default=0, description="Number of keywords matched by this row.")
    n_keywords: int = Field(default=0, description="Total number of included keywords.")
    matched_keywords: list[str] = Field(default_factory=list)
    matched_serials: list[int] = Field(default_factory=list)
    matches: list[MatchSnippet] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchExecuteRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
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
                        "keyword": "\"managed services\"",
                        "mode": "lexical",
                        "action": "include",
                        "weight": 1,
                    },
                ],
                "query_expression": "1 OR 2",
                "page": 1,
                "page_size": 25,
                "include_highlights": True,
                "include_metadata": True,
            }
        }
    )

    keywords: list[KeywordInput] = Field(
        default_factory=list,
        description="Ordered keyword rows referenced by query expressions.",
    )
    query_expression: str = Field(
        default="",
        description="Boolean expression over keyword serial numbers. Leave blank for default soft-AND mode.",
    )
    page: int = Field(default=1, ge=1, description="1-based page number to return.")
    page_size: int = Field(default=100, ge=1, description="Number of rows to return in the first page.")
    include_highlights: bool = Field(default=False, description="Whether to hydrate snippet highlights.")
    include_metadata: bool = Field(default=True, description="Whether to join company metadata into results.")


class SearchResultsResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "search_id": "8d2c2e2a4d7444f28bcf8f3ccf9e9c28",
                "search_mode": "expression",
                "query_expression": "1 OR 2",
                "parsed_query": "(#1:\"manufacturer\" OR #2:\"managed services\")",
                "total_count": 169648,
                "page": 1,
                "page_size": 25,
                "results": [],
                "keyword_hit_counts": {"manufacturer": 169648, "managed services": 124},
                "cache_hit": False,
                "timings_ms": {"search": 112.4, "keyword_hit_counts": 18.2, "total": 144.1},
            }
        }
    )

    search_id: str = Field(description="Opaque cache key used to fetch later pages.")
    search_mode: Literal["default", "expression"] = Field(description="Which search path produced the result set.")
    query_expression: str = Field(default="", description="Original query expression, if any.")
    parsed_query: str = Field(default="", description="Human-readable boolean expression expanded from serial numbers.")
    total_count: int = Field(description="Total number of rows in the cached result set.")
    page: int = Field(description="Current 1-based page.")
    page_size: int = Field(description="Requested page size.")
    results: list[SearchResultRow] = Field(description="Rows for the current page.")
    keyword_hit_counts: dict[str, int] = Field(default_factory=dict)
    cache_hit: bool | None = Field(
        default=None,
        description="Whether the response was served from an existing cached search record.",
    )
    timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Timing breakdown for the request or page hydration in milliseconds.",
    )


class SearchPageResponse(SearchResultsResponse):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "search_id": "8d2c2e2a4d7444f28bcf8f3ccf9e9c28",
                "search_mode": "expression",
                "query_expression": "1 OR 2",
                "parsed_query": "(#1:\"manufacturer\" OR #2:\"managed services\")",
                "total_count": 169648,
                "page": 1,
                "page_size": 25,
                "page_count": 6786,
                "results": [],
                "keyword_hit_counts": {"manufacturer": 169648, "managed services": 124},
                "cache_hit": False,
                "timings_ms": {"search": 112.4, "keyword_hit_counts": 18.2, "total": 144.1},
            }
        }
    )

    page_count: int = Field(description="Total number of pages in the cached result set.")
