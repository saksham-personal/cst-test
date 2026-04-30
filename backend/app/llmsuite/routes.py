from __future__ import annotations

from fastapi import APIRouter, Request

from app.llmsuite.schemas import (
    ChatCompletionResponse,
    ChatCreateRequest,
    DeploymentCreateRequest,
    DeploymentInfo,
    DeploymentPatchRequest,
    LLMSuiteHealthStatus,
    LLMSuiteIdentity,
    LLMSuiteModelInfo,
    StructuredChatRequest,
    StructuredChatResponse,
)

router = APIRouter(prefix="/llmsuite", tags=["llmsuite"])


def get_client(request: Request):
    return request.app.state.llmsuite_client


@router.get("/health", response_model=LLMSuiteHealthStatus)
async def health(request: Request):
    client = get_client(request)
    return await client.health()


@router.get("/identity", response_model=LLMSuiteIdentity)
async def get_identity(request: Request):
    client = get_client(request)
    return await client.identity.get()


@router.get("/models", response_model=list[LLMSuiteModelInfo])
async def list_models(request: Request):
    client = get_client(request)
    return await client.models.list()


@router.post("/deployments", response_model=DeploymentInfo)
async def create_deployment(payload: DeploymentCreateRequest, request: Request):
    client = get_client(request)
    return await client.deployments.create(payload)


@router.patch("/deployments/{deployment_id}", response_model=DeploymentInfo)
async def patch_deployment(deployment_id: str, payload: DeploymentPatchRequest, request: Request):
    client = get_client(request)
    return await client.deployments.patch(deployment_id, payload)


@router.delete("/deployments/{deployment_id}")
async def delete_deployment(deployment_id: str, request: Request):
    client = get_client(request)
    return await client.deployments.delete(deployment_id)


@router.post("/chat/completions", response_model=ChatCompletionResponse)
async def chat_completion(payload: ChatCreateRequest, request: Request):
    client = get_client(request)
    return await client.chat.create(payload)


@router.post("/structured", response_model=StructuredChatResponse)
async def structured_completion(payload: StructuredChatRequest, request: Request):
    client = get_client(request)
    return await client.structured.create(payload)

