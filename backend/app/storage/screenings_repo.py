from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _encode_json(payload: Any) -> str | None:
    if payload is None:
        return None
    return json.dumps(payload, ensure_ascii=False)


def _decode_json(payload: Any, default: Any) -> Any:
    if payload in (None, ""):
        return default
    if isinstance(payload, (dict, list)):
        return payload
    try:
        return json.loads(str(payload))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


class ScreeningsRepository:
    def __init__(self, db_path: str, documents_dir: str) -> None:
        self.db_path = Path(db_path)
        self.documents_dir = Path(documents_dir)
        self._init_db()

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS screening_documents (
                    id TEXT PRIMARY KEY,
                    pdf_sha256 TEXT NOT NULL UNIQUE,
                    original_filename TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL,
                    mime_type TEXT,
                    extraction_status TEXT NOT NULL,
                    raw_extraction_payload_json TEXT NOT NULL,
                    extraction_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS screenings (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    screen_name TEXT,
                    website TEXT,
                    inbound_date TEXT,
                    target_date TEXT,
                    targets_found INTEGER,
                    output_file TEXT,
                    extracted_fields_json TEXT NOT NULL,
                    edited_fields_json TEXT NOT NULL,
                    llm_request_json TEXT,
                    llm_response_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES screening_documents(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_screenings_document_id ON screenings(document_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_screenings_updated_at ON screenings(updated_at)"
            )

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _document_from_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        payload = dict(row)
        payload["file_size_bytes"] = int(payload.get("file_size_bytes") or 0)
        payload["raw_extraction_payload"] = _decode_json(payload.pop("raw_extraction_payload_json", "{}"), {})
        return payload

    def _screening_from_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        payload = dict(row)
        payload["targets_found"] = (
            int(payload["targets_found"]) if payload.get("targets_found") is not None else None
        )
        payload["extracted_fields"] = _decode_json(payload.pop("extracted_fields_json", "{}"), {})
        payload["edited_fields"] = _decode_json(payload.pop("edited_fields_json", "{}"), {})
        payload["llm_request_json"] = _decode_json(payload.get("llm_request_json"), None)
        payload["llm_response_json"] = _decode_json(payload.get("llm_response_json"), None)
        payload["raw_extraction_payload"] = _decode_json(payload.get("raw_extraction_payload_json"), {})
        return payload

    def get_document_by_hash(self, pdf_sha256: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM screening_documents WHERE pdf_sha256 = ?",
                (pdf_sha256,),
            ).fetchone()
        return self._document_from_row(row)

    def get_document_by_id(self, document_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM screening_documents WHERE id = ?",
                (document_id,),
            ).fetchone()
        return self._document_from_row(row)

    def create_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO screening_documents (
                    id, pdf_sha256, original_filename, storage_path, file_size_bytes,
                    mime_type, extraction_status, raw_extraction_payload_json,
                    extraction_version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["pdf_sha256"],
                    payload["original_filename"],
                    payload["storage_path"],
                    int(payload.get("file_size_bytes") or 0),
                    payload.get("mime_type"),
                    payload.get("extraction_status", "completed"),
                    _encode_json(payload.get("raw_extraction_payload", {})),
                    payload.get("extraction_version", "stub-v1"),
                    payload.get("created_at") or _now_iso(),
                    payload.get("updated_at") or _now_iso(),
                ),
            )
        created = self.get_document_by_id(str(payload["id"]))
        if created is None:  # pragma: no cover - defensive path
            raise RuntimeError("Failed to create screening document record.")
        return created

    def list_screenings_for_document(self, document_id: str) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM screenings WHERE document_id = ? ORDER BY updated_at DESC, created_at DESC",
                (document_id,),
            ).fetchall()
        return [item for item in (self._screening_from_row(row) for row in rows) if item is not None]

    def create_screening(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO screenings (
                    id, document_id, status, screen_name, website, inbound_date,
                    target_date, targets_found, output_file, extracted_fields_json,
                    edited_fields_json, llm_request_json, llm_response_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["document_id"],
                    payload.get("status", "draft"),
                    payload.get("screen_name"),
                    payload.get("website"),
                    payload.get("inbound_date"),
                    payload.get("target_date"),
                    payload.get("targets_found"),
                    payload.get("output_file"),
                    _encode_json(payload.get("extracted_fields", {})) or "{}",
                    _encode_json(payload.get("edited_fields", {})) or "{}",
                    _encode_json(payload.get("llm_request_json")),
                    _encode_json(payload.get("llm_response_json")),
                    payload.get("created_at") or _now_iso(),
                    payload.get("updated_at") or _now_iso(),
                ),
            )
        created = self.get_screening(str(payload["id"]))
        if created is None:  # pragma: no cover - defensive path
            raise RuntimeError("Failed to create screening record.")
        return created

    def get_screening(self, screening_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            row = conn.execute(
                """
                SELECT
                    s.*,
                    d.original_filename,
                    d.pdf_sha256,
                    d.storage_path,
                    d.file_size_bytes,
                    d.mime_type,
                    d.raw_extraction_payload_json
                FROM screenings s
                JOIN screening_documents d ON d.id = s.document_id
                WHERE s.id = ?
                """,
                (screening_id,),
            ).fetchone()
        return self._screening_from_row(row)

    def update_screening(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        screening_id = str(payload.get("id", "")).strip()
        if not screening_id:
            return None
        existing = self.get_screening(screening_id)
        if existing is None:
            return None
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE screenings
                SET document_id = ?, status = ?, screen_name = ?, website = ?,
                    inbound_date = ?, target_date = ?, targets_found = ?, output_file = ?,
                    extracted_fields_json = ?, edited_fields_json = ?, llm_request_json = ?,
                    llm_response_json = ?, created_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.get("document_id", existing["document_id"]),
                    payload.get("status", existing.get("status", "draft")),
                    payload.get("screen_name"),
                    payload.get("website"),
                    payload.get("inbound_date"),
                    payload.get("target_date"),
                    payload.get("targets_found"),
                    payload.get("output_file"),
                    _encode_json(payload.get("extracted_fields", existing.get("extracted_fields", {}))) or "{}",
                    _encode_json(payload.get("edited_fields", existing.get("edited_fields", {}))) or "{}",
                    _encode_json(payload.get("llm_request_json")),
                    _encode_json(payload.get("llm_response_json")),
                    payload.get("created_at", existing.get("created_at") or _now_iso()),
                    payload.get("updated_at") or _now_iso(),
                    screening_id,
                ),
            )
        return self.get_screening(screening_id)
