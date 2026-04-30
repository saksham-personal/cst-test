from __future__ import annotations

import json
import uuid
from typing import Any

from app.llmsuite.config import LLMSuiteConfig
from app.llmsuite.schemas import LLMSuiteIdentity, LLMSuiteModelInfo


class LLMSuiteSessionManager:
    """Stub Playwright/session manager for the future real LLMSuite adapter.

    Important:
    - This class deliberately mirrors the eventual browser-backed contract.
    - The current implementation is safe for local development and tests.
    - Replace the internals later with real persistent-profile Playwright logic.
    """

    def __init__(self, config: LLMSuiteConfig):
        self.config = config
        self.identity: LLMSuiteIdentity | None = None
        self.models: list[LLMSuiteModelInfo] = []
        self.last_error: str | None = None
        self.browser_running = False
        self.page_loaded = False

    async def start(self) -> None:
        self.browser_running = True
        await self.load_llmsuite()
        await self.bootstrap()

    async def stop(self) -> None:
        self.browser_running = False
        self.page_loaded = False

    async def load_llmsuite(self) -> None:
        self.page_loaded = True

    async def bootstrap(self) -> None:
        self.identity = await self.discover_identity()
        self.models = await self.discover_models()

    async def discover_identity(self) -> LLMSuiteIdentity:
        return LLMSuiteIdentity(
            tenantId="stub-tenant-id",
            groupId="stub-group-id",
            userId="stub-user-id",
            raw={"mode": "stub"},
        )

    async def discover_models(self) -> list[LLMSuiteModelInfo]:
        return [
            LLMSuiteModelInfo(
                modelId="stub-screening-model",
                displayName="Stub Screening Model",
                provider="stub",
                supportsThinking=True,
                supportsTools=True,
                raw={"mode": "stub"},
            )
        ]

    async def reload_after_auth_error(self) -> None:
        await self.bootstrap()

    async def run_console_js(self, script: str, args: dict[str, Any] | None = None) -> Any:
        return {
            "executed": False,
            "reason": "LLMSuite console JavaScript execution is intentionally stubbed in this prototype.",
            "scriptPreview": script[:120],
            "args": args or {},
        }

    async def internal_api_call(self, *, operation: str, payload: dict[str, Any], timeout_ms: int | None = None) -> dict[str, Any]:
        timeout_ms = timeout_ms or self.config.api_timeout_ms
        if operation == "createDeployment":
            return {
                "deploymentId": f"dep_{uuid.uuid4().hex[:12]}",
                "name": payload.get("name", self.config.default_stub_deployment_name),
                "description": payload.get("description"),
                "systemPrompt": payload.get("systemPrompt"),
                "modelConfig": payload.get("modelConfig"),
                "tools": payload.get("tools", []),
                "sources": payload.get("sources", []),
                "raw": {"timeoutMs": timeout_ms, "mode": "stub"},
            }
        if operation == "patchDeployment":
            return {
                "deploymentId": payload.get("deploymentId", "stub-deployment"),
                "name": payload.get("name", self.config.default_stub_deployment_name),
                "description": payload.get("description"),
                "systemPrompt": payload.get("systemPrompt"),
                "modelConfig": payload.get("modelConfig"),
                "tools": payload.get("tools", []),
                "sources": payload.get("sources", []),
                "raw": {"timeoutMs": timeout_ms, "mode": "stub"},
            }
        if operation == "deleteDeployment":
            return {
                "deleted": True,
                "deploymentId": payload.get("deploymentId", "stub-deployment"),
                "raw": {"timeoutMs": timeout_ms, "mode": "stub"},
            }
        if operation == "chatCompletion":
            messages = payload.get("messages", [])
            last_user_message = next(
                (
                    str(item.get("content", "")).strip()
                    for item in reversed(messages)
                    if str(item.get("role", "")).strip() == "user"
                ),
                "",
            )
            metadata = dict(payload.get("metadata", {}) or {})
            screening_payload = metadata.get("screeningPayload")
            screening_note = ""
            if screening_payload is not None:
                if isinstance(screening_payload, dict):
                    keys = ", ".join(sorted(str(key) for key in screening_payload.keys())[:8])
                    screening_note = f" The screening payload is attached with keys: {keys}."
                else:
                    screening_note = " A screening payload is attached to this conversation context."
            preview = last_user_message[:220] if last_user_message else "No analyst message was provided yet."
            return {
                "assistantMessage": (
                    "Stub LLMSuite response. This message proves the generic proxy surface is wired correctly."
                    f"{screening_note} Last analyst message preview: {preview}"
                ),
                "finishReason": "stop",
                "usage": {
                    "inputTokens": max(1, len(json.dumps(messages)) // 8),
                    "outputTokens": 48,
                    "totalTokens": max(1, len(json.dumps(messages)) // 8) + 48,
                    "raw": {"mode": "stub"},
                },
                "raw": {
                    "operation": operation,
                    "timeoutMs": timeout_ms,
                    "stub": True,
                    "messageCount": len(messages),
                    "metadata": metadata,
                },
            }
        return {
            "raw": {
                "operation": operation,
                "payload": payload,
                "timeoutMs": timeout_ms,
                "stub": True,
            }
        }

