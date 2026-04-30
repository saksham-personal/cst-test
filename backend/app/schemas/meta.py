from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "ok",
                "index_loaded": True,
                "app_name": "Company Screener API",
                "environment": "development",
            }
        }
    )

    status: str
    index_loaded: bool
    app_name: str
    environment: str


class MetaResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "app_name": "Company Screener API",
                "api_version": "v1",
                "environment": "development",
                "index_dir": "E:/company-screener/search_index_exact",
                "index_loaded": True,
                "primary_key": "Company",
                "company_name_col": "Company",
            }
        }
    )

    app_name: str
    api_version: str
    environment: str
    index_dir: str
    index_loaded: bool
    primary_key: str
    company_name_col: str


class ConfigResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "app_name": "Company Screener API",
                "api_v1_prefix": "/api/v1",
                "environment": "development",
                "index_dir": "E:/company-screener/search_index_exact",
                "index_loaded": True,
                "scoring_ext_path": "E:/company-screener/scoring_ext",
                "lists_dir": "E:/company-screener/lists",
                "search_history_path": "E:/company-screener/search_history.json",
                "index_jobs_dir": "E:/company-screener/index_jobs",
                "index_bundles_dir": "E:/company-screener/index_bundles",
                "index_uploads_dir": "E:/company-screener/index_uploads",
                "active_index_state_path": "E:/company-screener/active_index_bundle.json",
                "default_page_size": 100,
                "max_page_size": 1000,
                "search_cache_max_entries": 8,
                "search_cache_ttl_seconds": 1800,
                "search_history_max_entries": 10,
                "list_name_max_length": 100,
                "max_thread_workers": 8,
                "request_timeout_seconds": 30.0,
                "cors_origins": ["http://localhost:3000"],
            }
        }
    )

    app_name: str
    api_v1_prefix: str
    environment: str
    index_dir: str
    index_loaded: bool
    scoring_ext_path: str
    lists_dir: str
    search_history_path: str
    index_jobs_dir: str
    index_bundles_dir: str
    index_uploads_dir: str
    active_index_state_path: str
    default_page_size: int
    max_page_size: int
    search_cache_max_entries: int
    search_cache_ttl_seconds: int
    search_history_max_entries: int
    list_name_max_length: int
    max_thread_workers: int
    request_timeout_seconds: float
    cors_origins: list[str] = Field(default_factory=list)


class CapabilitiesResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "index_loaded": True,
                "primary_key": "Company",
                "company_name_col": "Company",
                "fts_table_name": "company_fts",
                "exact_fts_table_name": "company_exact_fts",
                "exact_fts_available": True,
                "supports_expression_queries": True,
                "supports_quoted_exact_keywords": True,
                "supports_exact_fallback": True,
                "supports_pagination": True,
                "supports_highlights": True,
                "scoring_mode": "bm25",
                "num_companies": 200000,
                "source_columns": [
                    "Pitchbook Description",
                    "Pitchbook Keywords",
                    "Company Description",
                ],
                "search_cache_max_entries": 8,
                "search_cache_ttl_seconds": 1800,
            }
        }
    )

    index_loaded: bool
    primary_key: str
    company_name_col: str
    fts_table_name: str
    exact_fts_table_name: str
    exact_fts_available: bool | None = None
    supports_expression_queries: bool
    supports_quoted_exact_keywords: bool
    supports_exact_fallback: bool
    supports_pagination: bool
    supports_highlights: bool
    scoring_mode: str | None = None
    num_companies: int | None = None
    source_columns: list[str] = Field(default_factory=list)
    search_cache_max_entries: int
    search_cache_ttl_seconds: int
