from __future__ import annotations

import socket
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

import uvicorn
from curl_cffi import requests
from fastapi import FastAPI

from app.core.config import Settings


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
