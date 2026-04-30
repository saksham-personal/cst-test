from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.search import KeywordInput


class SearchHistoryEntry(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "timestamp": "2026-04-12T10:30:00",
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
                "timings_ms": {"search": 112.4, "total": 144.1},
            }
        }
    )

    timestamp: str = Field(description="ISO 8601 timestamp when the search was recorded.")
    keywords: list[KeywordInput] = Field(default_factory=list, description="Keyword rows used for the search.")
    query_expression: str = Field(default="", description="Boolean expression used for the search, if any.")
    parsed_query: str = Field(default="", description="Human-readable form of the query expression for UI replay.")
    search_mode: Literal["default", "expression"] = Field(
        default="default",
        description="Whether the search ran in default or expression mode.",
    )
    result_count: int = Field(default=0, description="Total number of results returned by the search.")
    page: int = Field(default=1, description="Page number requested for the original search.")
    page_size: int = Field(default=100, description="Page size requested for the original search.")
    include_highlights: bool = Field(default=False, description="Whether highlights were requested.")
    include_metadata: bool = Field(default=True, description="Whether metadata was requested.")
    keyword_hit_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Keyword hit counts captured for the search, if available.",
    )
    timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Timing breakdown captured when the search was recorded.",
    )


class SearchHistoryRecordRequest(BaseModel):
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
                "timings_ms": {"search": 112.4, "total": 144.1},
            }
        }
    )

    keywords: list[KeywordInput] = Field(default_factory=list, description="Keyword rows to persist in history.")
    query_expression: str = Field(default="", description="Boolean expression associated with the search.")
    parsed_query: str = Field(default="", description="Human-readable parsed query for the frontend.")
    search_mode: Literal["default", "expression"] = Field(
        default="default",
        description="Whether the recorded search used default or expression mode.",
    )
    result_count: int = Field(default=0, description="Total number of results to store.")
    page: int = Field(default=1, ge=1, description="Page number requested for the original search.")
    page_size: int = Field(default=100, ge=1, description="Page size requested for the original search.")
    include_highlights: bool = Field(default=False, description="Whether highlights were requested.")
    include_metadata: bool = Field(default=True, description="Whether metadata was requested.")
    keyword_hit_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Keyword hit counts captured for the search, if available.",
    )
    timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Optional timing breakdown captured for the recorded search.",
    )


class SearchHistoryResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "max_entries": 10,
                "count": 1,
                "entries": [
                    {
                        "timestamp": "2026-04-12T10:30:00",
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
                        "timings_ms": {"search": 112.4, "total": 144.1},
                    }
                ],
            }
        }
    )

    max_entries: int = Field(description="Maximum number of history rows kept on disk.")
    count: int = Field(description="Current number of stored history rows.")
    entries: list[SearchHistoryEntry] = Field(default_factory=list, description="Most recent history rows, newest first.")


class SearchHistoryClearResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "cleared": True,
                "count": 1,
            }
        }
    )

    cleared: bool = Field(description="Whether the clear operation succeeded.")
    count: int = Field(default=0, description="Number of history rows removed.")
