from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.core.dependencies import get_screenings_service
from app.core.errors import ValidationAppError
from app.services.screenings import ScreeningsService

router = APIRouter(prefix="/criteria-analysis", tags=["criteria-analysis"])


class CriteriaColumn(BaseModel):
    key: str
    label: str


class CriteriaTable(BaseModel):
    columns: List[CriteriaColumn]
    rows: List[Dict[str, str]]


class CriteriaText(BaseModel):
    type: str = "bullet_list"
    items: List[str]


class InitialUnderstanding(BaseModel):
    table: CriteriaTable
    text: CriteriaText


class CriteriaQuestion(BaseModel):
    id: str
    category: str  # "blocker" | "general"
    question_concise: str
    question_detailed: str = ""
    answer: Optional[str] = None


class FinalCriteria(BaseModel):
    content_markdown: str


class CriteriaAnalysisResponse(BaseModel):
    initial_understanding: InitialUnderstanding
    questions: List[CriteriaQuestion]
    current_final_criteria: FinalCriteria
    screening_id: Optional[str] = None
    pipeline_step: int = 1
    pipeline_status: str = "FORM_UPLOADED"
    criteria_completed: bool = False


class AnalyzeRequest(BaseModel):
    screening_id: str
    screening_payload: Optional[Dict[str, Any]] = None


class RefineRequest(BaseModel):
    screening_id: str
    answers: List[Dict[str, str]]


class CriteriaProgressRequest(BaseModel):
    screening_id: str
    stage: str


class RerunCriteriaRequest(BaseModel):
    screening_id: str


STUB_RESPONSE = CriteriaAnalysisResponse(
    initial_understanding=InitialUnderstanding(
        table=CriteriaTable(
            columns=[
                CriteriaColumn(key="criteria_part", label="Criteria Part"),
                CriteriaColumn(key="value", label="Value"),
            ],
            rows=[
                {"criteria_part": "Business Model", "value": "Subscription-based SaaS"},
                {"criteria_part": "Target Customer", "value": "Enterprise finance teams"},
            ],
        ),
        text=CriteriaText(
            type="bullet_list",
            items=[
                "The company likely serves B2B customers.",
                "The offering appears to be software-led.",
                "More evidence is required from product and pricing pages.",
            ],
        ),
    ),
    questions=[
        CriteriaQuestion(
            id="q1",
            category="blocker",
            question_concise="Does the company provide ISO 27001 certification services?",
            question_detailed="",
            answer=None,
        ),
        CriteriaQuestion(
            id="q2",
            category="general",
            question_concise="What services does the company offer?",
            question_detailed="",
            answer=None,
        ),
        CriteriaQuestion(
            id="q3",
            category="general",
            question_concise="Which industries does the company serve?",
            question_detailed="",
            answer=None,
        ),
    ],
    current_final_criteria=FinalCriteria(
        content_markdown="- Must be a **Certification Body / Registrar / Provider** of certification services.\n- Must provide at least one target certification such as **ISO 9001**, **ISO 14001**, **ISO 45001**, **ISO 27001**, **ISO 50001**, or **ISO 20000-1**.\n- Must serve customers in the **US and/or Canada**.\n- Should not be only a consulting firm unless it also directly provides **certification, audit, or registrar services**.\n- <u>Exclude companies that only provide training, software, or advisory services without issuing certifications.</u>"
    ),
)


def _response_for_screening(
    screenings_service: ScreeningsService,
    screening_id: str,
) -> CriteriaAnalysisResponse:
    response = STUB_RESPONSE.model_copy(deep=True)
    detail = screenings_service.get_screening(screening_id)
    response.screening_id = detail.id
    response.pipeline_step = detail.pipeline_step
    response.pipeline_status = detail.pipeline_status
    response.criteria_completed = bool(detail.curr_final_criteria)
    if detail.curr_final_criteria:
        response.current_final_criteria.content_markdown = detail.curr_final_criteria
    return response


@router.post("/analyze", response_model=CriteriaAnalysisResponse)
async def analyze_criteria(
    req: AnalyzeRequest,
    screenings_service: ScreeningsService = Depends(get_screenings_service),
):
    """Stub: Analyze screening criteria from a PDF/payload and return structured understanding."""
    screenings_service.ensure_active_screening(req.screening_id)
    return _response_for_screening(screenings_service, req.screening_id)


@router.post("/progress", response_model=CriteriaAnalysisResponse)
async def mark_criteria_progress(
    req: CriteriaProgressRequest,
    screenings_service: ScreeningsService = Depends(get_screenings_service),
):
    """Persist the user's current criteria-analysis stage so reopening resumes there."""
    screenings_service.ensure_active_screening(req.screening_id)
    stage = req.stage.strip().lower()
    if stage == "questions":
        screenings_service.update_pipeline_state(
            req.screening_id,
            pipeline_step=ScreeningsService.STEP_USER_QA_PENDING,
            pipeline_status=ScreeningsService.PIPELINE_STATUS_USER_QA_PENDING,
            is_active=True,
        )
    elif stage == "final":
        screenings_service.update_pipeline_state(
            req.screening_id,
            pipeline_step=ScreeningsService.STEP_GENERATING_CRITERIA,
            pipeline_status=ScreeningsService.PIPELINE_STATUS_GENERATING_CRITERIA,
            is_active=True,
        )
    elif stage == "keywords":
        screenings_service.update_pipeline_state(
            req.screening_id,
            pipeline_step=ScreeningsService.STEP_KEYWORD_SEARCH,
            pipeline_status=ScreeningsService.PIPELINE_STATUS_KEYWORD_SEARCH,
            is_active=True,
        )
    else:
        raise ValidationAppError("Unknown criteria-analysis stage.", details={"stage": req.stage})
    return _response_for_screening(screenings_service, req.screening_id)


@router.post("/rerun", response_model=CriteriaAnalysisResponse)
async def rerun_criteria_analysis(
    req: RerunCriteriaRequest,
    screenings_service: ScreeningsService = Depends(get_screenings_service),
):
    """Reset saved criteria-analysis progress so the flow starts from the first step again."""
    screenings_service.ensure_active_screening(req.screening_id)
    screenings_service.reset_criteria_analysis(req.screening_id)
    return _response_for_screening(screenings_service, req.screening_id)


@router.post("/refine", response_model=CriteriaAnalysisResponse)
async def refine_criteria(
    req: RefineRequest,
    screenings_service: ScreeningsService = Depends(get_screenings_service),
):
    """Stub: Take user answers to follow-up questions and refine criteria."""
    screenings_service.ensure_active_screening(req.screening_id)
    screenings_service.update_pipeline_state(
        req.screening_id,
        pipeline_step=ScreeningsService.STEP_GENERATING_CRITERIA,
        pipeline_status=ScreeningsService.PIPELINE_STATUS_GENERATING_CRITERIA,
        is_active=True,
    )
    response = _response_for_screening(screenings_service, req.screening_id)
    screenings_service.save_current_final_criteria(
        req.screening_id,
        response.current_final_criteria.content_markdown,
    )
    screenings_service.update_pipeline_state(
        req.screening_id,
        pipeline_step=ScreeningsService.STEP_KEYWORD_SEARCH,
        pipeline_status=ScreeningsService.PIPELINE_STATUS_KEYWORD_SEARCH,
        is_active=True,
    )
    return _response_for_screening(screenings_service, req.screening_id)
