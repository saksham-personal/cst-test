from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from tests.support import run_test_server


def test_search_execute_returns_validation_error_when_no_index_is_loaded(tmp_path: Path) -> None:
    settings = Settings(
        index_dir=str(tmp_path / "missing_index"),
        index_jobs_dir=str(tmp_path / "index_jobs"),
        index_bundles_dir=str(tmp_path / "index_bundles"),
        index_uploads_dir=str(tmp_path / "index_uploads"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
        lists_dir=str(tmp_path / "lists"),
        search_history_path=str(tmp_path / "search_history.json"),
    )

    with run_test_server(settings) as (client, base_url, _):
        response = client.post(
            f"{base_url}/api/v1/search/execute",
            json={
                "keywords": [
                    {
                        "serial": 1,
                        "keyword": "xylophonium",
                        "mode": "lexical",
                        "action": "include",
                        "weight": 1,
                    }
                ],
                "query_expression": "",
                "page": 1,
                "page_size": 10,
                "include_highlights": False,
                "include_metadata": True,
            },
        )

        assert response.status_code == 400
        payload = response.json()
        assert payload["error"]["code"] == "VALIDATION_ERROR"
        assert "No search index loaded" in payload["error"]["message"]
        assert payload["error"]["details"]["index_dir"] == str(tmp_path / "missing_index")
