from pathlib import Path
from app.core.config import Settings
from tests.support import run_test_server

settings = Settings(
    index_dir=str(Path(__file__).resolve().parents[1] / "search_index_exact"),
    lists_dir=str(Path("tmp_debug_lists")),
    search_history_path=str(Path("tmp_debug_history.json")),
    active_index_state_path=str(Path("tmp_debug_active_index_bundle.json")),
    search_cache_max_entries=4,
    search_cache_ttl_seconds=60,
)
with run_test_server(settings) as (client, base_url, _):
    response = client.post(
        f"{base_url}/api/v1/search/execute",
        json={
            "keywords": [
                {
                    "serial": 1,
                    "keyword": "manufacturer",
                    "mode": "lexical",
                    "action": "include",
                    "weight": 1,
                }
            ],
            "query_expression": "1",
            "page": 1,
            "page_size": 1,
            "include_highlights": False,
            "include_metadata": False,
        },
    )
    print("status=", response.status_code)
    print("json=", response.json())
