from __future__ import annotations

from pathlib import Path

from curl_cffi import curl

from app.core.config import Settings
from app.services.screenings import ScreeningsService
from tests.support import run_test_server


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        index_dir=str(Path(__file__).resolve().parents[2] / "search_index_exact"),
        lists_dir=str(tmp_path / "lists"),
        search_history_path=str(tmp_path / "search_history.json"),
        active_index_state_path=str(tmp_path / "active_index_bundle.json"),
        screenings_dir=str(tmp_path / "screenings"),
        screenings_db_path=str(tmp_path / "screenings" / "screenings.db"),
        screening_documents_dir=str(tmp_path / "screenings" / "documents"),
        search_cache_max_entries=4,
        search_cache_ttl_seconds=60,
    )


def _make_pdf_bytes(label: str) -> bytes:
    text = label.replace("(", "[").replace(")", "]")
    pdf = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 49 >>
stream
BT
/F1 18 Tf
36 96 Td
({text}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000248 00000 n 
0000000347 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
417
%%EOF
"""
    return pdf.encode("utf-8")


def _multipart_pdf(filename: str, payload: bytes) -> curl.CurlMime:
    return curl.CurlMime.from_list(
        [
            {
                "name": "file",
                "filename": filename,
                "content_type": "application/pdf",
                "data": payload,
            }
        ]
    )


def _stub_extraction(_: ScreeningsService, pdf_path: Path) -> dict[str, str]:
    stem = pdf_path.stem.upper()[:8]
    return {
        "Type": "Screening Form",
        "Name": f"Stub {stem}",
        "HQ": "Mumbai",
        "Sponsor name": "Acme Capital",
        "Sponsor Relationship": "Advisor",
        "Screening Request Name": "Stub Request",
        "Submitter Name": "Jane Doe",
        "Submitter SID": "SID-42",
        "Senior Client Exec(s)": "Exec One",
        "Target Sector": "Healthcare",
        "Target Revenue": "$10M-$50M",
        "Target EBITDA": "$1M-$5M",
        "Investment Criteria": "Grow recurring revenue.",
        "Geographical Focus": "India",
    }


def test_screening_intake_duplicate_clone_and_start_flow(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(ScreeningsService, "_extract_with_pdfplumber_stub", _stub_extraction)
    settings = _make_settings(tmp_path)
    pdf_bytes = _make_pdf_bytes("Alpha Screening")

    with run_test_server(settings) as (client, base_url, _):
        created = client.post(
            f"{base_url}/api/v1/screenings/intake",
            multipart=_multipart_pdf("screening.pdf", pdf_bytes),
        )
        assert created.status_code == 200
        created_payload = created.json()
        assert created_payload["status"] == "created"
        screening = created_payload["screening"]
        assert screening["status"] == "draft"
        assert screening["screen_name"] is None
        assert screening["edited_fields"]["target_sector"] == "Healthcare"

        duplicate = client.post(
            f"{base_url}/api/v1/screenings/intake",
            multipart=_multipart_pdf("screening-copy.pdf", pdf_bytes),
        )
        assert duplicate.status_code == 200
        duplicate_payload = duplicate.json()
        assert duplicate_payload["status"] == "duplicate"
        assert duplicate_payload["document_id"] == created_payload["document_id"]
        assert duplicate_payload["default_reuse_screening_id"] == screening["id"]
        assert len(duplicate_payload["existing_screenings"]) == 1

        cloned = client.post(
            f"{base_url}/api/v1/screenings/intake/duplicate-create",
            json={"document_id": created_payload["document_id"]},
        )
        assert cloned.status_code == 200
        cloned_payload = cloned.json()
        assert cloned_payload["id"] != screening["id"]
        assert cloned_payload["document_id"] == created_payload["document_id"]
        assert cloned_payload["edited_fields"]["submitter_name"] == "Jane Doe"

        detail = client.get(f"{base_url}/api/v1/screenings/{screening['id']}")
        assert detail.status_code == 200
        assert detail.json()["pdf_sha256"] == created_payload["document"]["pdf_sha256"]

        patched = client.patch(
            f"{base_url}/api/v1/screenings/{screening['id']}/fields",
            json={
                "screen_name": "Healthcare Platform Targets",
                "website": "example.com",
                "edited_fields": {"target_sector": "Healthcare IT"},
            },
        )
        assert patched.status_code == 200
        patched_payload = patched.json()
        assert patched_payload["screen_name"] == "Healthcare Platform Targets"
        assert patched_payload["website"] == "example.com"
        assert patched_payload["edited_fields"]["target_sector"] == "Healthcare IT"

        raw_key_patch = client.patch(
            f"{base_url}/api/v1/screenings/{screening['id']}/fields",
            json={"edited_fields": {"Target Sector": "Raw key should not be accepted"}},
        )
        assert raw_key_patch.status_code == 400
        assert "Target Sector" in raw_key_patch.json()["error"]["details"]["invalid_keys"]

        pdf_response = client.get(f"{base_url}/api/v1/screenings/{screening['id']}/pdf")
        assert pdf_response.status_code == 200
        assert "application/pdf" in pdf_response.headers.get("content-type", "")
        assert pdf_response.content.startswith(b"%PDF")

        started = client.post(f"{base_url}/api/v1/screenings/{screening['id']}/start")
        assert started.status_code == 200
        started_payload = started.json()
        assert started_payload["status"] == "screening_started"
        assert started_payload["payload"]["screen_name"] == "Healthcare Platform Targets"
        assert started_payload["payload"]["edited_fields"]["target_sector"] == "Healthcare IT"


def test_screening_start_requires_screen_name(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(ScreeningsService, "_extract_with_pdfplumber_stub", _stub_extraction)
    settings = _make_settings(tmp_path)

    with run_test_server(settings) as (client, base_url, _):
        created = client.post(
            f"{base_url}/api/v1/screenings/intake",
            multipart=_multipart_pdf("missing-name.pdf", _make_pdf_bytes("Missing Name")),
        )
        assert created.status_code == 200
        screening_id = created.json()["screening"]["id"]

        start_response = client.post(f"{base_url}/api/v1/screenings/{screening_id}/start")
        assert start_response.status_code == 400
        assert start_response.json()["error"]["message"] == "Screen Name is required before starting screening."
