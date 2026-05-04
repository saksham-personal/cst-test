from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile

import pandas as pd

from app.core.config import Settings
from tests.support import resolve_test_index_dir, run_test_server


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        index_dir=resolve_test_index_dir(),
        lists_dir=str(tmp_path / "lists"),
        search_history_path=str(tmp_path / "search_history.json"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
        search_cache_max_entries=4,
        search_cache_ttl_seconds=60,
    )


def test_keyword_parse_validate_and_template() -> None:
    with run_test_server() as (client, base_url, _):
        template = client.get(f"{base_url}/api/v1/keywords/template")
        parsed = client.post(
            f"{base_url}/api/v1/keywords/parse",
            json={"text": "#,keyword,mode,action,weight\n10,manufacturer,exact,include,1\n20,hvac,exact,include,2"},
        )
        validated = client.post(
            f"{base_url}/api/v1/keywords/validate",
            json={
                "query_expression": "10 OR 20",
                "keywords": parsed.json()["keywords"],
            },
        )

    assert template.status_code == 200
    assert "keyword_template.csv" in template.json()["filename"]
    assert parsed.status_code == 200
    parsed_payload = parsed.json()
    assert [item["serial"] for item in parsed_payload["keywords"]] == [10, 20]
    assert "timings_ms" in parsed_payload
    assert validated.status_code == 200
    assert validated.json()["valid"] is True
    assert "manufacturer" in validated.json()["parsed_query"]
    assert "timings_ms" in validated.json()


def test_search_and_list_exports(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with run_test_server(settings) as (client, base_url, _):
        search = client.post(
            f"{base_url}/api/v1/search/execute",
            json={
                "keywords": [
                    {
                        "serial": 1,
                        "keyword": "manufacturer",
                        "mode": "lexical",
                        "action": "include",
                        "weight": 1,
                    },
                ],
                "query_expression": "1",
                "page": 1,
                "page_size": 2,
                "include_highlights": False,
                "include_metadata": False,
            },
        )
        assert search.status_code == 200
        assert search.json()["total_count"] > 0
        search_id = search.json()["search_id"]

        search_export = client.get(
            f"{base_url}/api/v1/exports/search/{search_id}",
            params={
                "format": "csv",
                "include_highlights": "false",
                "include_metadata": "true",
                "highlight_limit": 10,
            },
        )
        search_export_xlsx = client.get(
            f"{base_url}/api/v1/exports/search/{search_id}",
            params={
                "format": "xlsx",
                "include_highlights": "false",
                "include_metadata": "true",
                "highlight_limit": 10,
            },
        )

        created = client.post(f"{base_url}/api/v1/lists", json={"name": "Targets"})
        assert created.status_code == 200
        added = client.post(
            f"{base_url}/api/v1/lists/Targets/companies",
            json={
                "companies": [
                    {
                        "company": "Acme Manufacturing",
                        "primary_key_value": "Acme Manufacturing",
                        "source_keywords": ["manufacturer"],
                    }
                ]
            },
        )
        assert added.status_code == 200

        list_export = client.get(
            f"{base_url}/api/v1/exports/lists/Targets",
            params={"format": "csv", "include_metadata": "false"},
        )
        list_export_xlsx = client.get(
            f"{base_url}/api/v1/exports/lists/Targets",
            params={"format": "xlsx", "include_metadata": "true"},
        )

    assert search_export.status_code == 200
    assert "attachment;" in search_export.headers.get("content-disposition", "")
    assert "Matched Keywords" in search_export.text
    assert search_export_xlsx.status_code == 200
    assert search_export_xlsx.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert search_export_xlsx.content[:2] == b"PK"
    with NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(search_export_xlsx.content)
        tmp_path = Path(tmp.name)
    try:
        search_xlsx_df = pd.read_excel(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)
    assert not search_xlsx_df.empty
    first_search_row = search_xlsx_df.iloc[0].to_dict()
    assert first_search_row["Matched Keywords"]
    assert first_search_row["Crescendo ID"]
    assert first_search_row["Company"]

    assert list_export.status_code == 200
    assert "Keywords (all searches)" in list_export.text
    assert "Acme Manufacturing" in list_export.text
    assert list_export_xlsx.status_code == 200
    assert list_export_xlsx.content[:2] == b"PK"
