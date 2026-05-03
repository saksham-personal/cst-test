from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

router = APIRouter(prefix="/llm-screening", tags=["llm-screening"])

# --- Models ---
class PlatformScreenItem(BaseModel):
    id: str
    name: str

class IndependentUseCaseItem(BaseModel):
    id: str
    name: str

class GeneratePromptsRequest(BaseModel):
    screen_id: str
    rationale_enabled: bool

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

@router.post("/generate-prompts")
def generate_prompts(req: GeneratePromptsRequest):
    """Stub to return generated prompts for review."""
    prompts = {
        "Yes": "Does the company align with SaaS? -> YES",
        "No": "Does it completely fail our criteria? -> NO",
        "Maybe": "Is the information ambiguous or missing? -> MAYBE"
    }
    if req.rationale_enabled:
        prompts["Rationale"] = "Extract key reasoning for the decision."
    
    return {"prompts": prompts}

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
