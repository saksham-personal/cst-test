from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.core.dependencies import get_keyword_service
from app.schemas.keywords import (
    ExpressionValidateRequest,
    ExpressionValidateResponse,
    KeywordParseRequest,
    KeywordParseResponse,
    KeywordTemplateResponse,
)
from app.services.keywords import KeywordsService

router = APIRouter(prefix="/keywords", tags=["keywords"])


@router.post(
    "/parse",
    response_model=KeywordParseResponse,
    summary="Parse keyword imports",
    description=(
        "Parse pasted keyword text or CSV content into numbered keyword rows. "
        "Plain newline-separated text is accepted, and CSV imports can preserve custom serials."
    ),
    response_description="The parsed keyword rows and any validation warnings.",
    operation_id="parseKeywords",
)
def parse_keywords(
    payload: KeywordParseRequest = Body(
        ...,
        openapi_examples={
            "plain_text": {
                "summary": "Plain newline-separated keywords",
                "value": {
                    "text": "manufacturer\nhvac\nmanaged services",
                },
            },
            "csv": {
                "summary": "CSV import with custom serials",
                "value": {
                    "text": "#,keyword,mode,action,weight\n1,manufacturer,exact,include,1\n2,hvac,exact,include,1",
                },
            },
        },
    ),
    service: KeywordsService = Depends(get_keyword_service),
) -> KeywordParseResponse:
    return service.parse_keywords(payload)


@router.post(
    "/validate",
    response_model=ExpressionValidateResponse,
    summary="Validate a boolean keyword expression",
    description=(
        "Validate a query expression against the provided keyword rows. "
        "This uses the same parser and serial-number rules as the search runtime."
    ),
    response_description="The validation result for the expression.",
    operation_id="validateKeywordExpression",
)
def validate_expression(
    payload: ExpressionValidateRequest = Body(
        ...,
        openapi_examples={
            "expression": {
                "summary": "Validate a boolean expression",
                "value": {
                    "query_expression": "1 OR 2",
                    "keywords": [
                        {
                            "serial": 1,
                            "keyword": "manufacturer",
                            "mode": "lexical",
                            "action": "include",
                            "weight": 1,
                        },
                        {
                            "serial": 2,
                            "keyword": "hvac",
                            "mode": "lexical",
                            "action": "include",
                            "weight": 1,
                        },
                    ],
                },
            }
        },
    ),
    service: KeywordsService = Depends(get_keyword_service),
) -> ExpressionValidateResponse:
    return service.validate_expression(payload)


@router.get(
    "/template",
    response_model=KeywordTemplateResponse,
    summary="Get the keyword import template",
    description="Return a CSV template users can paste into to build keyword imports.",
    response_description="The CSV template filename and content.",
    operation_id="getKeywordTemplate",
)
def keyword_template(
    service: KeywordsService = Depends(get_keyword_service),
) -> KeywordTemplateResponse:
    return service.template()
