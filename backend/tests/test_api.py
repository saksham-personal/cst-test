from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.core.dependencies import get_index_job_service, get_search_service
from tests.support import run_test_server


@dataclass
class FakeSearchService:
    def capabilities(self) -> dict[str, object]:
        return {
            "index_loaded": True,
            "primary_key": "Crescendo ID",
            "company_name_col": "Company",
            "fts_table_name": "company_fts",
            "exact_fts_table_name": "company_exact_fts",
            "supports_expression_queries": True,
            "supports_quoted_exact_keywords": True,
            "supports_exact_fallback": True,
            "supports_pagination": True,
            "supports_highlights": True,
            "search_cache_max_entries": 8,
            "search_cache_ttl_seconds": 1800,
        }

    def execute_search(self, payload):  # type: ignore[no-untyped-def]
        return {
            "search_id": "abc123",
            "search_mode": "expression" if payload.query_expression else "default",
            "query_expression": payload.query_expression,
            "parsed_query": "#1:\"manufacturer\"",
            "total_count": 2,
            "page": payload.page,
            "page_size": payload.page_size,
            "page_count": 1,
            "results": [
                {
                    "primary_key_value": "CRE-100001",
                    "company_name": "Acme Co",
                    "rowid": 1,
                    "relevance": 1.0,
                    "completeness": 1.0,
                    "composite_score": 1.0,
                    "keywords_matched": 1,
                    "n_keywords": 1,
                    "matched_keywords": ["manufacturer"],
                    "matched_serials": [1],
                    "matches": [],
                    "metadata": {"Company": "Acme Co", "Crescendo ID": "CRE-100001"},
                }
            ],
            "keyword_hit_counts": {"manufacturer": 2},
        }

    def get_search_page(self, search_id: str, **kwargs):  # type: ignore[no-untyped-def]
        payload = self.execute_search(type("Payload", (), {"query_expression": "", "page": kwargs.get("page", 1), "page_size": kwargs.get("page_size", 100)})())
        payload["search_id"] = search_id
        return payload


@dataclass
class FakeIndexJobService:
    def list_jobs(self):  # type: ignore[no-untyped-def]
        return {
            "count": 1,
            "jobs": [
                {
                    "job_id": "idx_demo",
                    "source_type": "path",
                    "state": "running",
                    "stage": "building_index",
                    "percent": 68,
                    "message": "Indexing company 136000/200000",
                    "current": 136000,
                    "total": 200000,
                    "eta_seconds": 54,
                    "source_path": "E:\\data\\master_companies.xlsx",
                    "source_filename": "master_companies.xlsx",
                    "output_bundle_name": "q2_targets",
                    "output_dir": "E:\\company-screener\\index_bundles\\q2_targets_idxdemo",
                    "activate_on_success": True,
                    "created_at": "2026-04-12T11:40:00",
                    "updated_at": "2026-04-12T11:42:31",
                    "started_at": "2026-04-12T11:40:02",
                    "completed_at": None,
                    "activated_at": None,
                    "pid": 1234,
                    "exit_code": None,
                    "error": None,
                    "bundle_ready": False,
                    "timings_ms": {"build": 12000.0},
                    "details": {},
                }
            ],
        }

    def get_job(self, job_id: str):  # type: ignore[no-untyped-def]
        return self.list_jobs()["jobs"][0]

    def create_job_from_request(self, payload):  # type: ignore[no-untyped-def]
        return self.get_job("idx_demo")

    def activate_job(self, job_id: str):  # type: ignore[no-untyped-def]
        job = dict(self.get_job(job_id))
        job["state"] = "activated"
        job["stage"] = "activated"
        job["percent"] = 100
        job["bundle_ready"] = True
        return job


def test_meta_endpoints() -> None:
    with run_test_server() as (client, base_url, _):
        response = client.get(f"{base_url}/api/v1/meta")
        health = client.get(f"{base_url}/api/v1/meta/health")

    assert response.status_code == 200
    assert response.json()["primary_key"] == "Crescendo ID"
    assert health.status_code == 200
    assert health.json()["status"] == "ok"


def test_capabilities_and_search_routes_with_fake_service() -> None:
    fake_service = FakeSearchService()

    def _configure(app) -> None:  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_search_service] = lambda: fake_service

    with run_test_server(configure_app=_configure) as (client, base_url, _):
        capabilities = client.get(f"{base_url}/api/v1/meta/capabilities")
        execute = client.post(
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
                "page_size": 5,
                "include_highlights": False,
                "include_metadata": True,
            },
        )
        page = client.get(f"{base_url}/api/v1/search/abc123/page", params={"page": 1, "page_size": 5})

    assert capabilities.status_code == 200
    assert capabilities.json()["supports_expression_queries"] is True
    assert execute.status_code == 200
    assert execute.json()["search_id"] == "abc123"
    assert execute.json()["results"][0]["primary_key_value"] == "CRE-100001"
    assert execute.json()["cache_hit"] is None
    assert page.status_code == 200
    assert page.json()["search_id"] == "abc123"


def test_index_job_routes_with_fake_service() -> None:
    fake_service = FakeIndexJobService()

    def _configure(app) -> None:  # type: ignore[no-untyped-def]
        app.dependency_overrides[get_index_job_service] = lambda: fake_service

    with run_test_server(configure_app=_configure) as (client, base_url, _):
        jobs = client.get(f"{base_url}/api/v1/index-jobs")
        created = client.post(
            f"{base_url}/api/v1/index-jobs",
            json={
                "source_type": "path",
                "xlsx_path": "E:\\data\\master_companies.xlsx",
                "output_bundle_name": "q2_targets",
                "activate_on_success": True,
            },
        )
        detail = client.get(f"{base_url}/api/v1/index-jobs/idx_demo")
        activated = client.post(f"{base_url}/api/v1/index-jobs/idx_demo/activate")

    assert jobs.status_code == 200
    assert jobs.json()["count"] == 1
    assert jobs.json()["jobs"][0]["percent"] == 68
    assert created.status_code == 200
    assert detail.status_code == 200
    assert activated.status_code == 200
    assert activated.json()["state"] == "activated"


def test_real_search_engine_finds_results(tmp_path: Path) -> None:
    settings = Settings(
        index_dir=str(Path(__file__).resolve().parents[2] / "search_index_exact"),
        search_history_path=str(tmp_path / "history.json"),
        lists_dir=str(tmp_path / "lists"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
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

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] > 0
    assert payload["results"]
    assert payload["cache_hit"] is False
    assert "timings_ms" in payload


def test_openapi_metadata_and_route_docs() -> None:
    from app.main import create_app

    schema = create_app().openapi()

    assert schema["info"]["title"] == "Company Screener API"
    assert schema["info"]["summary"] == "Company Screener backend API"

    tags = {tag["name"]: tag["description"] for tag in schema["tags"]}
    assert "search" in tags
    assert "lists" in tags
    assert "keywords" in tags

    execute = schema["paths"]["/api/v1/search/execute"]["post"]
    assert execute["summary"] == "Execute a search"
    assert execute["operationId"] == "executeSearch"
    assert execute["requestBody"]["content"]["application/json"]["examples"]["expression"]["summary"] == "Boolean expression search"

    parse = schema["paths"]["/api/v1/keywords/parse"]["post"]
    assert parse["summary"] == "Parse keyword imports"
    assert parse["requestBody"]["content"]["application/json"]["examples"]["csv"]["summary"] == "CSV import with custom serials"

    create_list = schema["paths"]["/api/v1/lists"]["post"]
    assert create_list["summary"] == "Create a list"
    assert create_list["requestBody"]["content"]["application/json"]["examples"]["default"]["summary"] == "Create an empty list"

    copy_companies = schema["paths"]["/api/v1/lists/{list_name}/copy"]["post"]
    assert copy_companies["summary"] == "Copy companies to another list"
    assert copy_companies["requestBody"]["content"]["application/json"]["examples"]["default"]["summary"] == "Copy selected companies into another list"

    index_jobs = schema["paths"]["/api/v1/index-jobs"]["post"]
    assert index_jobs["summary"] == "Create an index build job from a workbook path"
    assert schema["paths"]["/api/v1/index-jobs/upload"]["post"]["summary"] == "Create an index build job from an uploaded workbook"
    assert schema["paths"]["/api/v1/index-jobs/{job_id}/activate"]["post"]["summary"] == "Activate a completed index bundle"
