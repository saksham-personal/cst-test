from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path
from typing import Any


def load_json(path: Path, default: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError, IOError):
        return default


def save_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=f".{path.stem}.",
            suffix=".tmp",
            delete=False,
        ) as tmp_file:
            json.dump(payload, tmp_file, indent=2, ensure_ascii=False)
            tmp_file.flush()
            tmp_path = Path(tmp_file.name)

        last_error: PermissionError | None = None
        for attempt in range(20):
            try:
                tmp_path.replace(path)
                tmp_path = None
                return
            except PermissionError as exc:
                last_error = exc
                if attempt == 19:
                    raise
                time.sleep(0.05 * (attempt + 1))

        if last_error is not None:
            raise last_error
    finally:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
