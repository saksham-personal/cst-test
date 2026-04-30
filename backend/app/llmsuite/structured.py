from __future__ import annotations

import json
import re
from typing import Any

from app.llmsuite.client import LLMSuiteChatClient
from app.llmsuite.errors import LLMSuiteInvalidJSONError, LLMSuiteSchemaValidationError
from app.llmsuite.schemas import ChatCreateRequest, ChatMessage, Role, StructuredChatRequest, StructuredChatResponse, WarningCode
from app.llmsuite.warnings import build_client_warning

FENCED_JSON_SYSTEM_PROMPT = """
You are a strict JSON API.

When a JSON schema is provided, return a single fenced JSON block.
Use this exact wrapper:
```json
{...}
```
""".strip()


def build_schema_instruction(schema: dict[str, Any]) -> str:
    return "Return JSON that matches this schema:\n\n" + json.dumps(schema, indent=2)


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```json\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        parsed = json.loads(fenced.group(1).strip())
        if not isinstance(parsed, dict):
            raise LLMSuiteInvalidJSONError("Structured output must be a JSON object.")
        return parsed
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise LLMSuiteInvalidJSONError("Structured output must be a JSON object.")
    return parsed


def build_placeholder_from_schema(schema: dict[str, Any]) -> dict[str, Any]:
    properties = dict(schema.get("properties", {}) or {})
    placeholder: dict[str, Any] = {}
    for key, definition in properties.items():
        field_type = definition.get("type")
        if field_type == "array":
            placeholder[key] = []
        elif field_type == "object":
            placeholder[key] = {}
        elif field_type == "number":
            placeholder[key] = 0
        elif field_type == "boolean":
            placeholder[key] = False
        else:
            placeholder[key] = f"TODO_{key.upper()}"
    for key in schema.get("required", []) or []:
        placeholder.setdefault(key, f"TODO_{str(key).upper()}")
    return placeholder


def validate_against_schema(parsed: dict[str, Any], schema: dict[str, Any]) -> None:
    required = [str(item) for item in schema.get("required", []) or []]
    missing = [key for key in required if key not in parsed]
    if missing:
        raise LLMSuiteSchemaValidationError(f"Missing required keys: {', '.join(missing)}")


class LLMSuiteStructuredClient:
    """Structured-output wrapper around the generic stub chat client.

    The current behavior is intentionally conservative:
    - ask the stub chat layer for JSON
    - try to parse fenced or raw JSON
    - if parsing fails, return a schema-shaped placeholder in non-strict mode
    - keep warning payloads explicit for the frontend debug panel
    """

    def __init__(self, chat_client: LLMSuiteChatClient):
        self.chat_client = chat_client

    async def create(self, request: StructuredChatRequest) -> StructuredChatResponse:
        warnings = []
        repair_attempts = 0
        chat_request = self._build_initial_request(request)
        chat_response = await self.chat_client.create(chat_request)
        raw_text = chat_response.message.content
        try:
            parsed = extract_json_object(raw_text)
            validate_against_schema(parsed, request.response_schema)
            return StructuredChatResponse(
                deploymentId=request.deployment_id,
                conversationId=request.conversation_id,
                parsed=parsed,
                rawText=raw_text,
                validationPassed=True,
                repairAttempts=repair_attempts,
                warnings=chat_response.warnings,
                usage=chat_response.usage,
                latencyMs=chat_response.latency_ms,
                raw=chat_response.raw,
            )
        except (LLMSuiteInvalidJSONError, LLMSuiteSchemaValidationError) as exc:
            warnings.extend(chat_response.warnings)
            warnings.append(
                build_client_warning(
                    WarningCode.partial_structured_output,
                    "Structured output is still stubbed. Returning a schema-shaped placeholder payload.",
                    error=str(exc),
                )
            )
            repair_attempts = min(1, request.max_repair_attempts)
            parsed = build_placeholder_from_schema(request.response_schema)
            if request.strict:
                raise LLMSuiteSchemaValidationError(str(exc)) from exc
            return StructuredChatResponse(
                deploymentId=request.deployment_id,
                conversationId=request.conversation_id,
                parsed=parsed,
                rawText=raw_text,
                validationPassed=False,
                repairAttempts=repair_attempts,
                warnings=warnings,
                usage=chat_response.usage,
                latencyMs=chat_response.latency_ms,
                raw={**chat_response.raw, "placeholderParsed": parsed},
            )

    def _build_initial_request(self, request: StructuredChatRequest) -> ChatCreateRequest:
        messages = list(request.messages)
        if request.inject_schema_instruction:
            messages = [
                ChatMessage(role=Role.system, content=FENCED_JSON_SYSTEM_PROMPT),
                ChatMessage(role=Role.system, content=build_schema_instruction(request.response_schema)),
                *messages,
            ]
        return ChatCreateRequest(
            deploymentId=request.deployment_id,
            conversationId=request.conversation_id,
            messages=messages,
            modelConfig=request.model_config,
            toolsEnabled=False if request.tools_enabled is None else request.tools_enabled,
            sourcesEnabled=False if request.sources_enabled is None else request.sources_enabled,
            metadata={**request.metadata, "structuredOutput": True},
            retryOnBlankMessage=request.retry_on_blank_message,
            retryOnTimeout=request.retry_on_timeout,
            retryOnAuthError=request.retry_on_auth_error,
        )

