from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from io import BytesIO

import pandas as pd

from app.core.dependencies import get_screenings_service
from app.services.screenings import ScreeningsService

router = APIRouter(prefix="/llm-screening", tags=["llm-screening"])

# --- Models ---
class PlatformScreenItem(BaseModel):
    id: str
    name: str

class IndependentUseCaseItem(BaseModel):
    id: str
    name: str

class GeneratePromptsRequest(BaseModel):
    screen_id: Optional[str] = None
    screening_id: Optional[str] = None
    rationale_enabled: bool = True

class GeneratePromptsResponse(BaseModel):
    prompts: Dict[str, str]
    source_screening_id: Optional[str] = None
    criteria_used: str = ""

class ValidateUploadRequest(BaseModel):
    filename: str
    input_cols: str
    output_cols: str

class StartJobResponse(BaseModel):
    job_id: str
    status: str

# --- Platform Screen Routes ---

@router.get("/screens", response_model=List[PlatformScreenItem])
def get_screens():
    """Stub to return available platform screens."""
    return [
        {"id": "1", "name": "SaaS Screening - 2026-05-01"},
        {"id": "2", "name": "Fintech Series A - 2026-04-20"},
        {"id": "3", "name": "Deeptech Q1 - 2026-03-15"}
    ]

def _build_prompts(criteria: str, rationale_enabled: bool) -> Dict[str, str]:
    clean_criteria = criteria.strip() or "Use the saved screening criteria for this screen."
    prompts = {
        "Yes": (
            "Classify a company as YES only when the available evidence clearly satisfies the final "
            "screening criteria below. Return a concise decision signal and cite the supporting facts.\n\n"
            f"Final screening criteria:\n{clean_criteria}"
        ),
        "No": (
            "Classify a company as NO when the available evidence clearly conflicts with one or more "
            "mandatory requirements in the final screening criteria below. Mention the decisive blocker.\n\n"
            f"Final screening criteria:\n{clean_criteria}"
        ),
        "Maybe": (
            "Classify a company as MAYBE when evidence is incomplete, ambiguous, or partially aligned "
            "with the final screening criteria below. State exactly what information is missing.\n\n"
            f"Final screening criteria:\n{clean_criteria}"
        ),
    }
    if rationale_enabled:
        prompts["Rationale"] = (
            "Write a short analyst rationale explaining the YES, NO, or MAYBE decision. Tie every claim "
            "back to the final screening criteria and avoid unsupported assumptions.\n\n"
            f"Final screening criteria:\n{clean_criteria}"
        )
    return prompts


@router.post("/generate-prompts", response_model=GeneratePromptsResponse)
def generate_prompts(
    req: GeneratePromptsRequest,
    screenings_service: ScreeningsService = Depends(get_screenings_service),
) -> GeneratePromptsResponse:
    """Generate reviewable LLM screening prompts from the saved final criteria for a screen."""
    screening_id = (req.screening_id or req.screen_id or "").strip()
    criteria = ""
    if screening_id:
        detail = screenings_service.get_screening(screening_id)
        criteria = (
            detail.curr_final_criteria
            or detail.edited_fields.get("investment_criteria")
            or detail.edited_fields.get("geographical_focus")
            or ""
        )
    return GeneratePromptsResponse(
        prompts=_build_prompts(criteria, req.rationale_enabled),
        source_screening_id=screening_id or None,
        criteria_used=criteria,
    )

@router.post("/job/start-platform", response_model=StartJobResponse)
def start_platform_job():
    """Stub to start a platform screen job."""
    return {"job_id": "job_12345", "status": "started"}

@router.get("/job/{job_id}/progress")
def get_job_progress(job_id: str):
    """Stub to return job progress (could be SSE, using JSON poll here for simplicity)."""
    return {
        "progress": 50,
        "counts": {"Yes": 12, "No": 5, "Maybe": 2, "Error": 1},
        "status": "Processing..."
    }

@router.get("/job/{job_id}/results")
def get_job_results(job_id: str):
    """Stub to return results for AG grid."""
    return [
        {"id": 1, "company": "TechNova", "rationale": "Strong SaaS recurring revenue", "website": "technova.example.com", "decision": "Yes"},
        {"id": 2, "company": "BioStream", "rationale": "Not SaaS", "website": "biostream.example.com", "decision": "No"},
        {"id": 3, "company": "DataPulse", "rationale": "Missing revenue details", "website": "datapulse.example.com", "decision": "Maybe"}
    ]

# --- Independent Use Case Routes ---

@router.get("/use-cases", response_model=List[IndependentUseCaseItem])
def get_use_cases():
    """Stub to return independent use cases."""
    return [
        {"id": "1", "name": "Vendor Analysis Q3"},
        {"id": "2", "name": "Competitor Feature Extraction"}
    ]

@router.get("/models")
def get_models():
    """Stub to return available LLM models."""
    return [
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
        {"id": "gpt-4o", "name": "GPT-4o"}
    ]

@router.post("/validate-upload")
def validate_upload(req: ValidateUploadRequest):
    """Stub to validate the excel columns."""
    return {"status": "success", "message": "Columns match and are ready."}

@router.post("/job/start-independent", response_model=StartJobResponse)
def start_independent_job():
    """Stub to start an independent use case job."""
    return {"job_id": "ind_job_9876", "status": "started"}


@router.get("/independent-output-stub")
def download_independent_output_stub(
    use_case_name: str = Query(default="Independent Use Case", description="Use case name for the stub output filename."),
) -> StreamingResponse:
    """Return a backend-generated stub XLSX output for the independent use-case flow."""
    safe_name = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in use_case_name).strip("_")
    filename = f"{safe_name or 'Independent_Use_Case'}_LLMExport.xlsx"
    output = BytesIO()
    df = pd.DataFrame(
        [
            {"index": 1, "decision": "Yes", "rationale": "Stub output generated by backend."},
            {"index": 2, "decision": "Maybe", "rationale": "More source data would be reviewed in production."},
            {"index": 3, "decision": "No", "rationale": "Example negative classification for UI testing."},
        ]
    )
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="LLM Output")
    output.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
