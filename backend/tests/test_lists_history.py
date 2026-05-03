from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from tests.support import run_test_server


def _make_settings(tmp_path: Path) -> Settings:
    candidate = Path(__file__).resolve().parents[2] / "search_index_exact"
    if not candidate.exists():
        candidate = Path(__file__).resolve().parents[2] / "search_index"
    return Settings(
        index_dir=str(candidate),
        lists_dir=str(tmp_path / "lists"),
        search_history_path=str(tmp_path / "search_history.json"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
        search_cache_max_entries=4,
        search_cache_ttl_seconds=60,
    )


def test_lists_crud_and_company_mutations(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with run_test_server(settings) as (client, base_url, _):
        created = client.post(f"{base_url}/api/v1/lists", json={"name": "Targets"})
        assert created.status_code == 200
        assert created.json()["item"]["name"] == "Targets"

        summaries = client.get(f"{base_url}/api/v1/lists")
        assert summaries.status_code == 200
        assert summaries.json()["lists"][0]["count"] == 0

        added = client.post(
            f"{base_url}/api/v1/lists/Targets/companies",
            json={
                "companies": [
                    {"company": "Acme Corp", "primary_key_value": "Acme Corp", "source_keywords": ["manufacturer"]},
                    {"company": "Beta Corp", "primary_key_value": "Beta Corp", "source_keywords": ["hvac"]},
                ]
            },
        )
        assert added.status_code == 200
        assert added.json()["added"] == 2

        duplicate = client.post(
            f"{base_url}/api/v1/lists/Targets/companies",
            json={
                "companies": [
                    {"company": "Acme Corp", "source_keywords": ["services"]},
                ]
            },
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["skipped"] == 1

        detail = client.get(f"{base_url}/api/v1/lists/Targets")
        assert detail.status_code == 200
        body = detail.json()
        assert body["count"] == 2
        acme = next(company for company in body["companies"] if company["company"] == "Acme Corp")
        assert acme["source_keywords"] == ["manufacturer", "services"]

        removed = client.delete(f"{base_url}/api/v1/lists/Targets/companies/Acme Corp")
        assert removed.status_code == 200
        assert removed.json()["removed"] is True

        deleted = client.delete(f"{base_url}/api/v1/lists/Targets")
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] is True


def test_lists_copy_companies_between_lists(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with run_test_server(settings) as (client, base_url, _):
        assert client.post(f"{base_url}/api/v1/lists", json={"name": "Source"}).status_code == 200
        assert client.post(f"{base_url}/api/v1/lists", json={"name": "Target"}).status_code == 200

        added = client.post(
            f"{base_url}/api/v1/lists/Source/companies",
            json={
                "companies": [
                    {
                        "company": "Acme Corp",
                        "primary_key_value": "Acme Corp",
                        "source_keywords": ["manufacturer", "services"],
                    },
                    {
                        "company": "Beta Corp",
                        "primary_key_value": "Beta Corp",
                        "source_keywords": ["hvac"],
                    },
                ]
            },
        )
        assert added.status_code == 200
        seeded_target = client.post(
            f"{base_url}/api/v1/lists/Target/companies",
            json={
                "companies": [
                    {
                        "company": "Acme Corp",
                        "primary_key_value": "Acme Corp",
                        "source_keywords": ["services"],
                    }
                ]
            },
        )
        assert seeded_target.status_code == 200

        copied = client.post(
            f"{base_url}/api/v1/lists/Source/copy",
            json={
                "target_list_name": "Target",
                "company_names": ["Acme Corp", "Beta Corp"],
            },
        )
        assert copied.status_code == 200
        payload = copied.json()
        assert payload["copied"] == 1
        assert payload["skipped"] == 1
        assert payload["count"] == 2

        copied_again = client.post(
            f"{base_url}/api/v1/lists/Source/copy",
            json={
                "target_list_name": "Target",
                "company_names": ["Acme Corp"],
            },
        )
        assert copied_again.status_code == 200
        assert copied_again.json()["copied"] == 0
        assert copied_again.json()["skipped"] == 1

        target_detail = client.get(f"{base_url}/api/v1/lists/Target")
        assert target_detail.status_code == 200
        companies = target_detail.json()["companies"]
        assert len(companies) == 2
        acme = next(company for company in companies if company["company"] == "Acme Corp")
        beta = next(company for company in companies if company["company"] == "Beta Corp")
        assert acme["source_keywords"] == ["manufacturer", "services"]
        assert beta["source_keywords"] == ["hvac"]


def test_history_record_list_and_clear(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with run_test_server(settings) as (client, base_url, _):
        recorded = client.post(
            f"{base_url}/api/v1/history",
            json={
                "keywords": [
                    {"keyword": "manufacturer", "mode": "lexical", "action": "include", "weight": 1}
                ],
                "query_expression": "1",
                "parsed_query": "#1:\"manufacturer\"",
                "search_mode": "expression",
                "result_count": 42,
                "page": 2,
                "page_size": 50,
                "include_highlights": True,
                "include_metadata": False,
                "keyword_hit_counts": {"manufacturer": 42},
            },
        )
        assert recorded.status_code == 200
        assert recorded.json()["result_count"] == 42
        assert recorded.json()["parsed_query"] == "#1:\"manufacturer\""
        assert recorded.json()["page"] == 2
        assert recorded.json()["include_highlights"] is True
        assert recorded.json()["keyword_hit_counts"]["manufacturer"] == 42

        history = client.get(f"{base_url}/api/v1/history")
        assert history.status_code == 200
        assert history.json()["count"] == 1
        assert history.json()["entries"][0]["search_mode"] == "expression"
        assert history.json()["entries"][0]["query_expression"] == "1"
        assert history.json()["entries"][0]["parsed_query"] == "#1:\"manufacturer\""
        assert history.json()["entries"][0]["page"] == 2
        assert history.json()["entries"][0]["page_size"] == 50
        assert history.json()["entries"][0]["keyword_hit_counts"]["manufacturer"] == 42

        cleared = client.delete(f"{base_url}/api/v1/history")
        assert cleared.status_code == 200
        assert cleared.json()["count"] == 1

        empty = client.get(f"{base_url}/api/v1/history")
        assert empty.status_code == 200
        assert empty.json()["count"] == 0


def test_search_execution_records_history(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
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
        assert response.status_code == 200

        history = client.get(f"{base_url}/api/v1/history")
        assert history.status_code == 200
        assert history.json()["count"] == 1
        assert history.json()["entries"][0]["query_expression"] == "1"
        assert history.json()["entries"][0]["parsed_query"]
        assert history.json()["entries"][0]["search_mode"] == "expression"
        assert history.json()["entries"][0]["keyword_hit_counts"]
        assert history.json()["entries"][0]["page_size"] == 1
