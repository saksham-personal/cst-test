from __future__ import annotations

import json
import sqlite3
import re
from datetime import datetime
from pathlib import Path
from typing import Any

def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"", "nan", "none"}:
        return ""
    return text

def _normalize_keywords(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        try:
            parsed = json.loads(values)
            if isinstance(parsed, list):
                values = parsed
            else:
                values = [values]
        except json.JSONDecodeError:
            values = [values]
            
    keywords = []
    for value in values:
        text = _normalize_text(value)
        if text:
            keywords.append(text)
    return sorted(set(keywords))

def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")

class ListsRepository:
    def __init__(self, lists_dir: str, *, max_name_length: int = 100) -> None:
        self.lists_dir = Path(lists_dir)
        self.max_name_length = max_name_length
        self.db_path = self.lists_dir / "lists.db"
        self._init_db()

    def _init_db(self) -> None:
        self.lists_dir.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS saved_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    screening_id TEXT,
                    screen_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            saved_list_columns = {
                str(row["name"])
                for row in conn.execute("PRAGMA table_info(saved_lists)").fetchall()
            }
            if "screening_id" not in saved_list_columns:
                conn.execute("ALTER TABLE saved_lists ADD COLUMN screening_id TEXT")
            if "screen_name" not in saved_list_columns:
                conn.execute("ALTER TABLE saved_lists ADD COLUMN screen_name TEXT")
            conn.execute('''
                CREATE TABLE IF NOT EXISTS list_companies (
                    list_id INTEGER,
                    primary_key_value TEXT NOT NULL,
                    company_name TEXT,
                    crescendo_id TEXT,
                    source_keywords TEXT,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (list_id, primary_key_value),
                    FOREIGN KEY (list_id) REFERENCES saved_lists(id) ON DELETE CASCADE
                )
            ''')

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def list_summaries(self, screening_id: str | None = None) -> list[dict[str, Any]]:
        screening_filter = _normalize_text(screening_id)
        with self._get_connection() as conn:
            query = '''
                SELECT l.name, l.screening_id, l.screen_name, l.created_at, l.updated_at, COUNT(c.primary_key_value) as count
                FROM saved_lists l
                LEFT JOIN list_companies c ON l.id = c.list_id
            '''
            params: list[str] = []
            if screening_filter == "__none__":
                query += " WHERE l.screening_id IS NULL OR TRIM(l.screening_id) = ''"
            elif screening_filter == "__associated__":
                query += " WHERE l.screening_id IS NOT NULL AND TRIM(l.screening_id) <> ''"
            elif screening_filter:
                query += ' WHERE l.screening_id = ?'
                params.append(screening_filter)
            query += ' GROUP BY l.id ORDER BY LOWER(l.name)'
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
        summaries = []
        for row in rows:
            summaries.append({
                "name": row["name"],
                "count": row["count"],
                "screening_id": row["screening_id"],
                "screen_name": row["screen_name"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            })
        return summaries

    def get_list(self, name: str) -> dict[str, Any] | None:
        name = _normalize_text(name)
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM saved_lists WHERE name = ?", (name,))
            list_row = cursor.fetchone()
            if not list_row:
                return None
                
            list_id = list_row["id"]
            cursor = conn.execute("SELECT * FROM list_companies WHERE list_id = ?", (list_id,))
            company_rows = cursor.fetchall()
            
            companies = []
            for c_row in company_rows:
                companies.append({
                    "company": c_row["company_name"],
                    "primary_key_value": c_row["primary_key_value"],
                    "crescendo_id": c_row["crescendo_id"],
                    "source_keywords": _normalize_keywords(c_row["source_keywords"]),
                    "added_at": c_row["added_at"]
                })
                
            return {
                "name": list_row["name"],
                "created_at": list_row["created_at"],
                "updated_at": list_row["updated_at"],
                "screening_id": list_row["screening_id"],
                "screen_name": list_row["screen_name"],
                "companies": companies
            }

    def save_list(self, data: dict[str, Any]) -> dict[str, Any]:
        name = _normalize_text(data.get("name"))
        if not name:
            raise ValueError("List name cannot be empty.")
            
        now = _now_iso()
        created_at = data.get("created_at") or now
        screening_id = _normalize_text(data.get("screening_id")) or None
        screen_name = _normalize_text(data.get("screen_name")) or None
        
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT id FROM saved_lists WHERE name = ?", (name,))
            list_row = cursor.fetchone()
            
            if list_row:
                list_id = list_row["id"]
                conn.execute(
                    "UPDATE saved_lists SET screening_id = ?, screen_name = ?, updated_at = ? WHERE id = ?",
                    (screening_id, screen_name, now, list_id),
                )
                conn.execute("DELETE FROM list_companies WHERE list_id = ?", (list_id,))
            else:
                cursor = conn.execute(
                    "INSERT INTO saved_lists (name, screening_id, screen_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (name, screening_id, screen_name, created_at, now)
                )
                list_id = cursor.lastrowid
                
            companies_data = []
            for entry in data.get("companies", []):
                company = _normalize_text(entry.get("company"))
                primary_key_value = _normalize_text(entry.get("primary_key_value"))
                crescendo_id = _normalize_text(entry.get("crescendo_id"))
                
                if not primary_key_value:
                    primary_key_value = crescendo_id
                if not crescendo_id and primary_key_value:
                    crescendo_id = primary_key_value
                if not company:
                    company = primary_key_value or crescendo_id
                    
                identity = primary_key_value or crescendo_id or company
                if not identity:
                    continue
                    
                source_keywords = json.dumps(_normalize_keywords(entry.get("source_keywords", [])))
                added_at = entry.get("added_at") or now
                
                companies_data.append((list_id, identity, company, crescendo_id, source_keywords, added_at))
                
            if companies_data:
                conn.executemany('''
                    INSERT OR IGNORE INTO list_companies (list_id, primary_key_value, company_name, crescendo_id, source_keywords, added_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', companies_data)
                
        return self.get_list(name)

    def create_list(
        self,
        name: str,
        *,
        screening_id: str | None = None,
        screen_name: str | None = None,
    ) -> dict[str, Any]:
        clean = _normalize_text(name)
        if not clean:
            raise ValueError("List name cannot be empty.")
        if len(clean) > self.max_name_length:
            raise ValueError(f"List name too long (max {self.max_name_length} characters).")
            
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT id FROM saved_lists WHERE name = ?", (clean,))
            if cursor.fetchone():
                raise FileExistsError(f"A list named '{clean}' already exists.")
                
            now = _now_iso()
            conn.execute(
                "INSERT INTO saved_lists (name, screening_id, screen_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (clean, _normalize_text(screening_id) or None, _normalize_text(screen_name) or None, now, now),
            )
            
        return self.get_list(clean)

    def delete_list(self, name: str) -> bool:
        name = _normalize_text(name)
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM saved_lists WHERE name = ?", (name,))
            return cursor.rowcount > 0

    def add_companies(self, list_name: str, companies: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, int, int]:
        list_name = _normalize_text(list_name)
        now = _now_iso()
        
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT id FROM saved_lists WHERE name = ?", (list_name,))
            list_row = cursor.fetchone()
            if not list_row:
                return None, 0, 0
                
            list_id = list_row["id"]
            conn.execute("UPDATE saved_lists SET updated_at = ? WHERE id = ?", (now, list_id))
            
            added = 0
            skipped = 0
            
            for entry in companies:
                company = _normalize_text(entry.get("company"))
                primary_key_value = _normalize_text(entry.get("primary_key_value"))
                crescendo_id = _normalize_text(entry.get("crescendo_id"))
                
                if not primary_key_value:
                    primary_key_value = crescendo_id
                if not crescendo_id and primary_key_value:
                    crescendo_id = primary_key_value
                if not company:
                    company = primary_key_value or crescendo_id
                    
                identity = primary_key_value or crescendo_id or company
                if not identity:
                    skipped += 1
                    continue
                    
                new_keywords = _normalize_keywords(entry.get("source_keywords", []))
                
                cursor = conn.execute(
                    "SELECT source_keywords FROM list_companies WHERE list_id = ? AND primary_key_value = ?",
                    (list_id, identity)
                )
                existing = cursor.fetchone()
                
                if existing:
                    existing_keywords = _normalize_keywords(existing["source_keywords"])
                    combined_keywords = sorted(set(existing_keywords + new_keywords))
                    
                    conn.execute(
                        "UPDATE list_companies SET source_keywords = ?, company_name = COALESCE(company_name, ?), crescendo_id = COALESCE(crescendo_id, ?) WHERE list_id = ? AND primary_key_value = ?",
                        (json.dumps(combined_keywords), company, crescendo_id, list_id, identity)
                    )
                    skipped += 1
                else:
                    added_at = entry.get("added_at") or now
                    conn.execute(
                        "INSERT INTO list_companies (list_id, primary_key_value, company_name, crescendo_id, source_keywords, added_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (list_id, identity, company, crescendo_id, json.dumps(new_keywords), added_at)
                    )
                    added += 1
                    
        return self.get_list(list_name), added, skipped

    def remove_companies(self, list_name: str, company_names: list[str]) -> tuple[dict[str, Any] | None, int]:
        list_name = _normalize_text(list_name)
        wanted = [_normalize_text(name) for name in company_names if _normalize_text(name)]
        if not wanted:
            return self.get_list(list_name), 0
            
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT id FROM saved_lists WHERE name = ?", (list_name,))
            list_row = cursor.fetchone()
            if not list_row:
                return None, 0
                
            list_id = list_row["id"]
            
            placeholders = ', '.join(['?'] * len(wanted))
            
            query = f'''
                DELETE FROM list_companies
                WHERE list_id = ? AND (
                    primary_key_value IN ({placeholders}) OR
                    crescendo_id IN ({placeholders}) OR
                    company_name IN ({placeholders})
                )
            '''
            params = [list_id] + wanted + wanted + wanted
            
            cursor = conn.execute(query, params)
            removed = cursor.rowcount
            
            if removed > 0:
                conn.execute("UPDATE saved_lists SET updated_at = ? WHERE id = ?", (_now_iso(), list_id))
                
        return self.get_list(list_name), removed
