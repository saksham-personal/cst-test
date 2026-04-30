from __future__ import annotations

import os
import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError:  # pragma: no cover - fallback for minimal environments
    BaseSettings = BaseModel  # type: ignore[assignment]

    def SettingsConfigDict(**_: object) -> dict[str, object]:
        return {}


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _default_index_dir() -> str:
    repo_root = _default_repo_root()
    active_state_path = repo_root / "active_index_bundle.json"
    try:
        with active_state_path.open(encoding="utf-8") as f:
            payload = json.load(f)
        persisted_index = Path(str(payload.get("index_dir", "")).strip())
        if persisted_index.exists():
            return str(persisted_index)
    except (FileNotFoundError, json.JSONDecodeError, OSError, IOError, AttributeError):
        pass
    exact = repo_root / "search_index_exact"
    if exact.exists():
        return str(exact)
    return str(repo_root / "search_index")


def _default_lists_dir() -> str:
    return str(_default_repo_root() / "lists")


def _default_search_history_path() -> str:
    return str(_default_repo_root() / "search_history.json")


def _default_index_jobs_dir() -> str:
    return str(_default_repo_root() / "index_jobs")


def _default_index_bundles_dir() -> str:
    return str(_default_repo_root() / "index_bundles")


def _default_index_uploads_dir() -> str:
    return str(_default_repo_root() / "index_uploads")


def _default_active_index_state_path() -> str:
    return str(_default_repo_root() / "active_index_bundle.json")


def _default_screenings_dir() -> str:
    return str(_default_repo_root() / "screenings")


def _default_screenings_db_path() -> str:
    return str(_default_repo_root() / "screenings" / "screenings.db")


def _default_screening_documents_dir() -> str:
    return str(_default_repo_root() / "screenings" / "documents")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Company Screener API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"
    index_dir: str = Field(default_factory=_default_index_dir)
    scoring_ext_path: str = Field(default_factory=lambda: str(_default_repo_root() / "scoring_ext"))
    lists_dir: str = Field(default_factory=_default_lists_dir)
    search_history_path: str = Field(default_factory=_default_search_history_path)
    index_jobs_dir: str = Field(default_factory=_default_index_jobs_dir)
    index_bundles_dir: str = Field(default_factory=_default_index_bundles_dir)
    index_uploads_dir: str = Field(default_factory=_default_index_uploads_dir)
    active_index_state_path: str = Field(default_factory=_default_active_index_state_path)
    screenings_dir: str = Field(default_factory=_default_screenings_dir)
    screenings_db_path: str = Field(default_factory=_default_screenings_db_path)
    screening_documents_dir: str = Field(default_factory=_default_screening_documents_dir)
    cors_origins: list[str] = Field(default_factory=lambda: [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ])
    default_page_size: int = 100
    max_page_size: int = 1000
    search_cache_max_entries: int = 8
    search_cache_ttl_seconds: int = 1800
    search_history_max_entries: int = 100
    list_name_max_length: int = 100
    max_thread_workers: int = 8
    request_timeout_seconds: float = 30.0

    @property
    def index_path(self) -> Path:
        return Path(self.index_dir)

    @property
    def index_exists(self) -> bool:
        return self.index_path.exists()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
