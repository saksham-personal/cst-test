from __future__ import annotations

import time
from io import BytesIO
from pathlib import Path

import pandas as pd
from curl_cffi import curl

from app.core.config import Settings
from app.services.index_jobs import IndexJobService
from tests.support import run_test_server


SOURCE_COLUMNS = [
    "Pitchbook Description",
    "Pitchbook Keywords",
    "Company Description",
    "Factset Description",
    "Offerings",
    "NAICS Description",
    "Demandbase Description",
    "Salesforce Description",
    "Dealogic Description",
]


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        index_dir=str(Path(__file__).resolve().parents[2] / "search_index_exact"),
        index_jobs_dir=str(tmp_path / "index_jobs"),
        index_bundles_dir=str(tmp_path / "index_bundles"),
        index_uploads_dir=str(tmp_path / "index_uploads"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
        lists_dir=str(tmp_path / "lists"),
        search_history_path=str(tmp_path / "search_history.json"),
        search_cache_max_entries=4,
        search_cache_ttl_seconds=60,
    )


def _build_workbook_bytes(*, company_name: str, term: str, crescendo_id: str | None = None) -> bytes:
    cid = crescendo_id or f"CRE-{abs(hash(company_name)) % 10_000_000}"
    row = {
        "Crescendo ID": cid,
        "Company": company_name,
        "Pitchbook Description": term,
        "Pitchbook Keywords": term,
        "Company Description": f"{term} description",
        "Factset Description": "",
        "Offerings": "",
        "NAICS Description": "",
        "Demandbase Description": "",
        "Salesforce Description": "",
        "Dealogic Description": "",
    }
    df = pd.DataFrame([row], columns=["Crescendo ID", "Company", *SOURCE_COLUMNS])
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Companies")
    return buffer.getvalue()


def _wait_for_job(client, base_url: str, job_id: str, *, timeout_seconds: float = 120.0) -> dict[str, object]:
    deadline = time.time() + timeout_seconds
    last_payload: dict[str, object] | None = None
    while time.time() < deadline:
        response = client.get(f"{base_url}/api/v1/index-jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        last_payload = payload
        if payload.get("state") in {"completed", "failed", "activated"}:
            return payload
        time.sleep(1.0)
    raise AssertionError(f"Timed out waiting for job {job_id}: {last_payload}")


def test_index_job_path_flow_builds_and_activates_bundle(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    workbook_path = tmp_path / "master_companies.xlsx"
    workbook_path.write_bytes(_build_workbook_bytes(company_name="Acme Xylophonium LLC", term="xylophonium"))

    with run_test_server(settings) as (client, base_url, _):
        created = client.post(
            f"{base_url}/api/v1/index-jobs",
            json={
                "source_type": "path",
                "xlsx_path": str(workbook_path),
                "output_bundle_name": "demo_bundle",
                "activate_on_success": False,
            },
        )
        assert created.status_code == 200
        job = created.json()
        assert job["state"] in {"queued", "running"}
        assert job["source_type"] == "path"
        assert job["percent"] >= 0

        completed = _wait_for_job(client, base_url, job["job_id"])
        assert completed["state"] == "completed"
        assert completed["percent"] == 100
        assert completed["bundle_ready"] is True
        assert completed["output_dir"]
        assert completed["timings_ms"]

        activated = client.post(f"{base_url}/api/v1/index-jobs/{job['job_id']}/activate")
        assert activated.status_code == 200
        assert activated.json()["state"] == "activated"

        search = client.post(
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
                "query_expression": "1",
                "page": 1,
                "page_size": 10,
                "include_highlights": False,
                "include_metadata": True,
            },
        )
        assert search.status_code == 200
        search_payload = search.json()
        assert search_payload["total_count"] == 1
        assert search_payload["results"][0]["company_name"] == "Acme Xylophonium LLC"


def test_index_job_upload_flow_and_list_endpoint(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    workbook_bytes = _build_workbook_bytes(company_name="Beta Xylophonium Inc", term="xylophonium")

    with run_test_server(settings) as (client, base_url, _):
        multipart = curl.CurlMime.from_list(
            [
                {
                    "name": "file",
                    "filename": "upload.xlsx",
                    "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "data": workbook_bytes,
                }
            ]
        )
        uploaded = client.post(
            f"{base_url}/api/v1/index-jobs/upload",
            data={
                "output_bundle_name": "upload_bundle",
                "activate_on_success": "false",
            },
            multipart=multipart,
        )
        assert uploaded.status_code == 200
        job = uploaded.json()
        assert job["source_type"] == "upload"
        assert job["source_filename"] == "upload.xlsx"

        completed = _wait_for_job(client, base_url, job["job_id"])
        assert completed["state"] == "completed"

        jobs = client.get(f"{base_url}/api/v1/index-jobs")
        assert jobs.status_code == 200
        payload = jobs.json()
        assert payload["count"] == 1
        assert payload["jobs"][0]["job_id"] == job["job_id"]

        activated = client.post(f"{base_url}/api/v1/index-jobs/{job['job_id']}/activate")
        assert activated.status_code == 200

        search = client.post(
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
                "query_expression": "1",
                "page": 1,
                "page_size": 10,
                "include_highlights": False,
                "include_metadata": True,
            },
        )
        assert search.status_code == 200
        assert search.json()["results"][0]["company_name"] == "Beta Xylophonium Inc"


def test_dead_index_worker_is_marked_failed_on_next_poll(tmp_path: Path, monkeypatch) -> None:
    settings = _make_settings(tmp_path)
    workbook_path = tmp_path / "broken_worker.xlsx"
    workbook_path.write_bytes(_build_workbook_bytes(company_name="Crash Test Co", term="crashterm"))

    class _DeadProcess:
        pid = 4242

        def poll(self) -> int:
            return 1

    monkeypatch.setattr(IndexJobService, "_spawn_worker", lambda self, job_id: _DeadProcess())

    with run_test_server(settings) as (client, base_url, _):
        created = client.post(
            f"{base_url}/api/v1/index-jobs",
            json={
                "source_type": "path",
                "xlsx_path": str(workbook_path),
                "output_bundle_name": "broken_bundle",
                "activate_on_success": False,
            },
        )
        assert created.status_code == 200
        job = created.json()
        assert job["state"] == "running"

        detail = client.get(f"{base_url}/api/v1/index-jobs/{job['job_id']}")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["state"] == "failed"
        assert payload["stage"] == "failed"
        assert payload["exit_code"] == 1
        assert "exited unexpectedly" in payload["message"]
