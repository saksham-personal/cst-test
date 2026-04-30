from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AliasedModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Role(str, Enum):
    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class WarningCode(str, Enum):
    auth_recovered = "auth_recovered"
    rate_limited = "rate_limited"
    blank_response_retry = "blank_response_retry"
    timeout_retry = "timeout_retry"
    json_parse_failed = "json_parse_failed"
    json_repair_attempted = "json_repair_attempted"
    schema_validation_failed = "schema_validation_failed"
    partial_structured_output = "partial_structured_output"
    provider_changed = "provider_changed"
    stub_response = "stub_response"


class ClientWarning(AliasedModel):
    code: WarningCode
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteIdentity(AliasedModel):
    tenant_id: str = Field(..., alias="tenantId")
    group_id: str = Field(..., alias="groupId")
    user_id: str | None = Field(default=None, alias="userId")
    raw: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteModelInfo(AliasedModel):
    model_id: str = Field(..., alias="modelId")
    display_name: str | None = Field(default=None, alias="displayName")
    provider: str | None = None
    supports_thinking: bool | None = Field(default=None, alias="supportsThinking")
    supports_tools: bool | None = Field(default=None, alias="supportsTools")
    raw: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteToolConfig(AliasedModel):
    tool_id: str = Field(..., alias="toolId")
    name: str | None = None
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteSourceConfig(AliasedModel):
    source_id: str = Field(..., alias="sourceId")
    name: str | None = None
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteModelConfig(AliasedModel):
    model: str
    temperature: float | None = 0.2
    max_tokens: int | None = Field(default=None, alias="maxTokens")
    thinking: bool | None = False
    top_p: float | None = Field(default=None, alias="topP")
    extra: dict[str, Any] = Field(default_factory=dict)


class DeploymentCreateRequest(AliasedModel):
    name: str
    description: str | None = None
    system_prompt: str | None = Field(default=None, alias="systemPrompt")
    model_config: LLMSuiteModelConfig = Field(..., alias="modelConfig")
    tools: list[LLMSuiteToolConfig] = Field(default_factory=list)
    sources: list[LLMSuiteSourceConfig] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DeploymentPatchRequest(AliasedModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = Field(default=None, alias="systemPrompt")
    model_config: LLMSuiteModelConfig | None = Field(default=None, alias="modelConfig")
    tools: list[LLMSuiteToolConfig] | None = None
    sources: list[LLMSuiteSourceConfig] | None = None
    metadata: dict[str, Any] | None = None


class DeploymentInfo(AliasedModel):
    deployment_id: str = Field(..., alias="deploymentId")
    name: str
    description: str | None = None
    system_prompt: str | None = Field(default=None, alias="systemPrompt")
    model_config: LLMSuiteModelConfig | None = Field(default=None, alias="modelConfig")
    tools: list[LLMSuiteToolConfig] = Field(default_factory=list)
    sources: list[LLMSuiteSourceConfig] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(AliasedModel):
    role: Role
    content: str
    name: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatCreateRequest(AliasedModel):
    deployment_id: str = Field(..., alias="deploymentId")
    conversation_id: UUID = Field(..., alias="conversationId")
    messages: list[ChatMessage]
    model_config: LLMSuiteModelConfig | None = Field(default=None, alias="modelConfig")
    tools_enabled: bool | None = Field(default=None, alias="toolsEnabled")
    sources_enabled: bool | None = Field(default=None, alias="sourcesEnabled")
    metadata: dict[str, Any] = Field(default_factory=dict)
    retry_on_blank_message: bool = Field(default=True, alias="retryOnBlankMessage")
    retry_on_timeout: bool = Field(default=True, alias="retryOnTimeout")
    retry_on_auth_error: bool = Field(default=True, alias="retryOnAuthError")


class UsageInfo(AliasedModel):
    input_tokens: int | None = Field(default=None, alias="inputTokens")
    output_tokens: int | None = Field(default=None, alias="outputTokens")
    total_tokens: int | None = Field(default=None, alias="totalTokens")
    raw: dict[str, Any] = Field(default_factory=dict)


class ChatCompletionResponse(AliasedModel):
    deployment_id: str = Field(..., alias="deploymentId")
    conversation_id: UUID = Field(..., alias="conversationId")
    message: ChatMessage
    finish_reason: str | None = Field(default=None, alias="finishReason")
    usage: UsageInfo | None = None
    latency_ms: int | None = Field(default=None, alias="latencyMs")
    warnings: list[ClientWarning] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class StructuredOutputMode(str, Enum):
    fenced_json = "fenced_json"
    json_only = "json_only"
    repair_retry = "repair_retry"


class StructuredChatRequest(ChatCreateRequest):
    response_schema: dict[str, Any] = Field(..., alias="responseSchema")
    strict: bool = False
    max_repair_attempts: int = Field(default=2, alias="maxRepairAttempts")
    mode: StructuredOutputMode = StructuredOutputMode.fenced_json
    inject_schema_instruction: bool = Field(default=True, alias="injectSchemaInstruction")


class StructuredChatResponse(AliasedModel):
    deployment_id: str = Field(..., alias="deploymentId")
    conversation_id: UUID = Field(..., alias="conversationId")
    parsed: dict[str, Any]
    raw_text: str = Field(..., alias="rawText")
    validation_passed: bool = Field(..., alias="validationPassed")
    repair_attempts: int = Field(default=0, alias="repairAttempts")
    warnings: list[ClientWarning] = Field(default_factory=list)
    usage: UsageInfo | None = None
    latency_ms: int | None = Field(default=None, alias="latencyMs")
    raw: dict[str, Any] = Field(default_factory=dict)


class LLMSuiteHealthStatus(AliasedModel):
    browser_running: bool = Field(..., alias="browserRunning")
    page_loaded: bool = Field(..., alias="pageLoaded")
    authenticated: bool
    identity: LLMSuiteIdentity | None = None
    model_count: int | None = Field(default=None, alias="modelCount")
    last_error: str | None = Field(default=None, alias="lastError")
    current_queue_depth: int | None = Field(default=None, alias="currentQueueDepth")
    seconds_until_next_request: float | None = Field(default=None, alias="secondsUntilNextRequest")

