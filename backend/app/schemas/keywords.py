from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.search import KeywordInput


class KeywordParseRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "text": "1,manufacturer,exact,include,1\n2,hvac,exact,include,1\n3,managed services,exact,exclude,1",
            }
        }
    )

    text: str = Field(
        default="",
        description="Plain text, newline-separated keywords, or CSV content with a keyword column.",
    )


class KeywordParseResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "keywords": [
                    {
                        "serial": 1,
                        "keyword": "manufacturer",
                        "mode": "lexical",
                        "action": "include",
                        "weight": 1,
                    }
                ],
                "errors": [],
                "warnings": [],
                "timings_ms": {"total": 4.3},
            }
        }
    )

    keywords: list[KeywordInput] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Timing breakdown for keyword parsing in milliseconds.",
    )


class ExpressionValidateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
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
            }
        }
    )

    query_expression: str = Field(default="", description="Boolean expression using keyword serial numbers.")
    keywords: list[KeywordInput] = Field(default_factory=list, description="Keyword rows referenced by the expression.")


class ExpressionValidateResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "valid": True,
                "parsed_query": "(#1:\"manufacturer\" OR #2:\"hvac\")",
                "errors": [],
                "warnings": [],
                "timings_ms": {"total": 0.8},
            }
        }
    )

    valid: bool
    parsed_query: str = ""
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    timings_ms: dict[str, float] = Field(
        default_factory=dict,
        description="Timing breakdown for expression validation in milliseconds.",
    )


class KeywordTemplateResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "filename": "keyword_template.csv",
                "content": "#,keyword,mode,action,weight\n1,solar energy,exact,include,1\n2,battery storage,exact,include,2\n3,fossil fuel,exact,exclude,1\n",
            }
        }
    )

    filename: str
    content: str
