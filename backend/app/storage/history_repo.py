from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from app.storage.json_store import load_json, save_json_atomic


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"", "nan", "none"}:
        return ""
    return text


class SearchHistoryRepository:
    def __init__(self, history_path: str, *, max_entries: int = 10) -> None:
        self.history_path = Path(history_path)
        self.max_entries = max_entries

    def load_history(self) -> list[dict[str, Any]]:
        data = load_json(self.history_path, default=[])
        if isinstance(data, dict):
            entries = data.get("entries")
            if isinstance(entries, list):
                return [entry for entry in entries if isinstance(entry, dict)]
            return []
        if isinstance(data, list):
            return [entry for entry in data if isinstance(entry, dict)]
        return []

    def save_history(self, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
        trimmed = history[: self.max_entries]
        save_json_atomic(self.history_path, trimmed)
        return trimmed

    def record(self, entry: dict[str, Any]) -> dict[str, Any]:
        history = self.load_history()
        normalized = {
            "timestamp": _normalize_text(entry.get("timestamp")) or _now_iso(),
            "keywords": [
                {
                    "serial": int(keyword.get("serial", 0) or 0) or None,
                    "keyword": _normalize_text(keyword.get("keyword")),
                    "mode": _normalize_text(keyword.get("mode")) or "lexical",
                    "action": _normalize_text(keyword.get("action")) or "include",
                    "weight": int(keyword.get("weight", 1) or 1),
                }
                for keyword in entry.get("keywords", [])
                if isinstance(keyword, dict) and _normalize_text(keyword.get("keyword"))
            ],
            "query_expression": _normalize_text(entry.get("query_expression")),
            "parsed_query": _normalize_text(entry.get("parsed_query")),
            "search_mode": _normalize_text(entry.get("search_mode")) or "default",
            "result_count": int(entry.get("result_count", 0) or 0),
            "page": int(entry.get("page", 1) or 1),
            "page_size": int(entry.get("page_size", 100) or 100),
            "include_highlights": bool(entry.get("include_highlights", False)),
            "include_metadata": bool(entry.get("include_metadata", True)),
            "keyword_hit_counts": {
                _normalize_text(key): int(value)
                for key, value in (entry.get("keyword_hit_counts") or {}).items()
                if _normalize_text(key)
            },
            "timings_ms": {
                _normalize_text(key): float(value)
                for key, value in (entry.get("timings_ms") or {}).items()
                if _normalize_text(key)
            },
        }
        history.insert(0, normalized)
        self.save_history(history)
        return normalized

    def clear(self) -> int:
        history = self.load_history()
        save_json_atomic(self.history_path, [])
        return len(history)
