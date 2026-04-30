from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.schemas.history import (
    SearchHistoryClearResponse,
    SearchHistoryEntry,
    SearchHistoryRecordRequest,
    SearchHistoryResponse,
)
from app.storage.history_repo import SearchHistoryRepository
from company_screener.engine import humanize_expression, parse_expression


class HistoryService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = SearchHistoryRepository(
            settings.search_history_path,
            max_entries=settings.search_history_max_entries,
        )

    def list_history(self) -> SearchHistoryResponse:
        entries = [SearchHistoryEntry(**entry) for entry in self.repo.load_history()]
        return SearchHistoryResponse(
            max_entries=self.settings.search_history_max_entries,
            count=len(entries),
            entries=entries,
        )

    def _canonicalize_record_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        keywords = [dict(keyword) for keyword in data.get("keywords", []) if isinstance(keyword, dict)]
        query_expression = str(data.get("query_expression", "") or "").strip()
        parsed_query = str(data.get("parsed_query", "") or "").strip()
        search_mode = str(data.get("search_mode", "") or "").strip()

        if not search_mode:
            search_mode = "expression" if query_expression else "default"

        if query_expression and not parsed_query:
            ast, error = parse_expression(query_expression)
            if not error and ast is not None:
                parsed_query = humanize_expression(ast, keywords)

        data["keywords"] = keywords
        data["query_expression"] = query_expression
        data["parsed_query"] = parsed_query
        data["search_mode"] = "expression" if search_mode == "expression" else "default"
        data["page"] = int(data.get("page", 1) or 1)
        data["page_size"] = int(data.get("page_size", 100) or 100)
        data["include_highlights"] = bool(data.get("include_highlights", False))
        data["include_metadata"] = bool(data.get("include_metadata", True))
        data["keyword_hit_counts"] = {
            str(key).strip(): int(value)
            for key, value in (data.get("keyword_hit_counts") or {}).items()
            if str(key).strip()
        }
        return data

    def record_search(self, payload: SearchHistoryRecordRequest | dict[str, Any]) -> SearchHistoryEntry:
        data = payload.model_dump() if isinstance(payload, SearchHistoryRecordRequest) else dict(payload)
        data = self._canonicalize_record_payload(data)
        return SearchHistoryEntry(**self.repo.record(data))

    def clear_history(self) -> SearchHistoryClearResponse:
        count = len(self.repo.load_history())
        self.repo.clear()
        return SearchHistoryClearResponse(cleared=True, count=count)
