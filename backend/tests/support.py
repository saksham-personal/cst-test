from __future__ import annotations

import json
import socket
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import uvicorn
from curl_cffi import requests
from fastapi import FastAPI

from app.core.config import Settings


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _is_index_bundle(path: Path) -> bool:
    return (
        path.exists()
        and (path / "search.db").exists()
        and (path / "company_metadata.parquet").exists()
        and (path / "index_config.json").exists()
    )


def resolve_test_index_dir() -> str:
    repo_root = _repo_root()
    candidates: list[Path] = []

    active_state_path = repo_root / "active_index_bundle.json"
    try:
        with active_state_path.open(encoding="utf-8") as handle:
            active_index_dir = Path(str(json.load(handle).get("index_dir", "")).strip())
        if active_index_dir:
            candidates.append(active_index_dir)
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        pass

    candidates.extend([
        repo_root / "search_index_exact",
        repo_root / "search_index",
    ])

    for candidate in candidates:
        if _is_index_bundle(candidate):
            return str(candidate)

    import pytest

    pytest.skip("No usable search index bundle is available for search-backed API tests.")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@contextmanager
def run_test_server(
    settings: Settings | None = None,
    *,
    configure_app: Callable[[FastAPI], None] | None = None,
) -> Iterator[tuple[requests.Session, str, FastAPI]]:
    from app.main import create_app

    app = create_app(settings)
    if configure_app is not None:
        configure_app(app)

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{port}"
    session = requests.Session()

    deadline = time.time() + 30
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            response = session.get(f"{base_url}/api/v1/meta/health", timeout=2)
            if response.status_code == 200:
                break
        except Exception as exc:  # pragma: no cover - startup timing path
            last_error = exc
            time.sleep(0.1)
    else:  # pragma: no cover - only runs if server boot fails
        server.should_exit = True
        thread.join(timeout=5)
        session.close()
        raise RuntimeError("Timed out waiting for test server to start.") from last_error

    try:
        yield session, base_url, app
    finally:
        session.close()
        server.should_exit = True
        thread.join(timeout=10)
