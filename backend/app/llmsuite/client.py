from __future__ import annotations

import time
from typing import Any

from app.llmsuite.config import LLMSuiteConfig
from app.llmsuite.errors import LLMSuiteAuthError, LLMSuiteBlankResponseError, LLMSuiteTimeoutError
from app.llmsuite.rate_limit import AsyncLLMSuiteRateLimiter
from app.llmsuite.schemas import (
    ChatCompletionResponse,
    ChatCreateRequest,
    ChatMessage,
    DeploymentCreateRequest,
    DeploymentInfo,
    DeploymentPatchRequest,
    LLMSuiteHealthStatus,
    Role,
    UsageInfo,
    WarningCode,
)
from app.llmsuite.session import LLMSuiteSessionManager
from app.llmsuite.warnings import build_client_warning


class LLMSuiteDeploymentsClient:
    def __init__(self, session: LLMSuiteSessionManager):
        self.session = session

    async def create(self, request: DeploymentCreateRequest) -> DeploymentInfo:
        identity = self.session.identity
        if identity is None:
            await self.session.bootstrap()
            identity = self.session.identity
        raw = await self.session.internal_api_call(
            operation="createDeployment",
            payload={
                "tenantId": identity.tenant_id if identity else "stub-tenant-id",
                "groupId": identity.group_id if identity else "stub-group-id",
                **request.model_dump(by_alias=True),
            },
        )
        return DeploymentInfo.model_validate(raw)

    async def patch(self, deployment_id: str, request: DeploymentPatchRequest) -> DeploymentInfo:
        identity = self.session.identity
        if identity is None:
            await self.session.bootstrap()
            identity = self.session.identity
        raw = await self.session.internal_api_call(
            operation="patchDeployment",
            payload={
                "tenantId": identity.tenant_id if identity else "stub-tenant-id",
                "groupId": identity.group_id if identity else "stub-group-id",
                "deploymentId": deployment_id,
                **request.model_dump(by_alias=True, exclude_none=True),
            },
        )
        return DeploymentInfo.model_validate(raw)

    async def delete(self, deployment_id: str) -> dict[str, Any]:
        identity = self.session.identity
        if identity is None:
            await self.session.bootstrap()
            identity = self.session.identity
        return await self.session.internal_api_call(
            operation="deleteDeployment",
            payload={
                "tenantId": identity.tenant_id if identity else "stub-tenant-id",
                "groupId": identity.group_id if identity else "stub-group-id",
                "deploymentId": deployment_id,
            },
        )


class LLMSuiteChatClient:
    def __init__(self, session: LLMSuiteSessionManager, rate_limiter: AsyncLLMSuiteRateLimiter, config: LLMSuiteConfig):
        self.session = session
        self.rate_limiter = rate_limiter
        self.config = config

    async def create(self, request: ChatCreateRequest) -> ChatCompletionResponse:
        warnings = []
        attempts = 0
        while True:
            try:
                rate_result = await self.rate_limiter.acquire()
                if rate_result.waited_seconds > 0:
                    warnings.append(
                        build_client_warning(
                            WarningCode.rate_limited,
                            "Request delayed by LLMSuite rate limiter.",
                            waitedSeconds=rate_result.waited_seconds,
                            queueDepthBefore=rate_result.queue_depth_before,
                        )
                    )
                response = await self._create_once(request)
                response.warnings.extend(warnings)
                response.warnings.append(
                    build_client_warning(
                        WarningCode.stub_response,
                        "The LLMSuite provider is currently stubbed. Replace the session manager internals for real provider traffic.",
                    )
                )
                return response
            except LLMSuiteAuthError:
                if not request.retry_on_auth_error or attempts >= self.config.max_auth_retries:
                    raise
                attempts += 1
                warnings.append(build_client_warning(WarningCode.auth_recovered, "Auth error detected. Reloaded stub session and retried.", attempt=attempts))
                await self.session.reload_after_auth_error()
            except LLMSuiteBlankResponseError:
                if not request.retry_on_blank_message or attempts >= self.config.max_blank_response_retries:
                    raise
                attempts += 1
                warnings.append(build_client_warning(WarningCode.blank_response_retry, "Blank assistant message encountered. Retrying stub call.", attempt=attempts))
            except LLMSuiteTimeoutError:
                if not request.retry_on_timeout or attempts >= self.config.max_timeout_retries:
                    raise
                attempts += 1
                warnings.append(build_client_warning(WarningCode.timeout_retry, "Stub chat call timed out. Retrying.", attempt=attempts))

    async def _create_once(self, request: ChatCreateRequest) -> ChatCompletionResponse:
        identity = self.session.identity
        if identity is None:
            await self.session.bootstrap()
            identity = self.session.identity
        started = time.perf_counter()
        raw = await self.session.internal_api_call(
            operation="chatCompletion",
            payload={
                "tenantId": identity.tenant_id if identity else "stub-tenant-id",
                "groupId": identity.group_id if identity else "stub-group-id",
                "deploymentId": request.deployment_id,
                "conversationId": str(request.conversation_id),
                "messages": [item.model_dump(mode="json") for item in request.messages],
                "modelConfig": request.llm_config.model_dump(by_alias=True) if request.llm_config else None,
                "toolsEnabled": request.tools_enabled,
                "sourcesEnabled": request.sources_enabled,
                "metadata": request.metadata,
            },
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        assistant_text = raw.get("assistantMessage") or raw.get("message") or raw.get("content") or ""
        if assistant_text == "":
            raise LLMSuiteBlankResponseError("Stub LLMSuite call returned an empty assistant message.")
        return ChatCompletionResponse(
            deploymentId=request.deployment_id,
            conversationId=request.conversation_id,
            message=ChatMessage(role=Role.assistant, content=assistant_text),
            finishReason=raw.get("finishReason"),
            usage=UsageInfo.model_validate(raw.get("usage", {"raw": {"stub": True}})),
            latencyMs=latency_ms,
            warnings=[],
            raw=raw,
        )


class LLMSuiteIdentityClient:
    def __init__(self, session: LLMSuiteSessionManager):
        self.session = session

    async def get(self):
        if self.session.identity is None:
            await self.session.bootstrap()
        return self.session.identity


class LLMSuiteModelsClient:
    def __init__(self, session: LLMSuiteSessionManager):
        self.session = session

    async def list(self):
        if not self.session.models:
            self.session.models = await self.session.discover_models()
        return self.session.models


class LLMSuiteProxyClient:
    def __init__(self, config: LLMSuiteConfig):
        self.config = config
        self.session = LLMSuiteSessionManager(config)
        self.rate_limiter = AsyncLLMSuiteRateLimiter(
            min_interval_seconds=config.min_seconds_between_messages,
            max_requests_per_minute=config.max_requests_per_minute,
        )
        self.deployments = LLMSuiteDeploymentsClient(self.session)
        self.chat = LLMSuiteChatClient(self.session, self.rate_limiter, config)
        self.identity = LLMSuiteIdentityClient(self.session)
        self.models = LLMSuiteModelsClient(self.session)
        self.structured = None

    async def start(self) -> None:
        await self.session.start()
        from app.llmsuite.structured import LLMSuiteStructuredClient
        self.structured = LLMSuiteStructuredClient(self.chat)

    async def stop(self) -> None:
        await self.session.stop()

    async def health(self) -> LLMSuiteHealthStatus:
        return LLMSuiteHealthStatus(
            browserRunning=self.session.browser_running,
            pageLoaded=self.session.page_loaded,
            authenticated=self.session.identity is not None,
            identity=self.session.identity,
            modelCount=len(self.session.models),
            lastError=self.session.last_error,
            currentQueueDepth=self.rate_limiter.queue_depth,
            secondsUntilNextRequest=self.rate_limiter.seconds_until_next_request(),
        )

