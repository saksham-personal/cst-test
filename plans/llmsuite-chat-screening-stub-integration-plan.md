# LLMSuite Chat + Screening Handoff Stub Plan

## Purpose
This document explains how the new LLM chat workspace should evolve from the current stub state into the full LLMSuite proxy architecture you outlined.

## Product goals captured from the request
1. Add a new [`LLM Chat`](frontend/src/pages/LLMChatPage.tsx) route in the left sidebar below [`Form Intake`](frontend/src/components/layout/Sidebar.tsx:8).
2. When an analyst presses [`Start Screening`](frontend/src/pages/ScreeningDetailPage.tsx:105), carry the full screening JSON into the chat workspace.
3. Make the chat workspace talk to a generic LLM proxy surface, not a screening-specific one.
4. Keep several pieces stubbed today, but name them clearly and document their intended future use.

## What is implemented now
- Backend stub LLMSuite package under [`backend/app/llmsuite`](backend/app/llmsuite).
- Generic stub routes under [`/api/v1/llmsuite/*`](backend/app/llmsuite/routes.py:1).
- Frontend chat route in [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1).
- Sidebar entry in [`Sidebar`](frontend/src/components/layout/Sidebar.tsx:8).
- Start-screening handoff from [`ScreeningDetailPage`](frontend/src/pages/ScreeningDetailPage.tsx:105) to [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1).
- Future-facing UI building blocks under [`frontend/src/components/llmChat`](frontend/src/components/llmChat).

## Current integration boundary
### Screening route
- [`ScreeningDetailPage`](frontend/src/pages/ScreeningDetailPage.tsx:105) still calls the screening-start stub endpoint.
- After the response returns, it navigates to [`/llm-chat/:screeningId`](frontend/src/App.tsx:7) and passes the response payload in route state.

### LLM chat route
- [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1) reads the seeded screening payload.
- On first load, it sends that payload through the generic stub chat completion endpoint.
- The payload also remains visible in [`LLMChatScreeningContextInspector`](frontend/src/components/llmChat/LLMChatScreeningContextInspector.tsx:1).

## Backend architecture path
### Present stub package
- [`config.py`](backend/app/llmsuite/config.py:1)
- [`schemas.py`](backend/app/llmsuite/schemas.py:1)
- [`errors.py`](backend/app/llmsuite/errors.py:1)
- [`warnings.py`](backend/app/llmsuite/warnings.py:1)
- [`rate_limit.py`](backend/app/llmsuite/rate_limit.py:1)
- [`session.py`](backend/app/llmsuite/session.py:1)
- [`client.py`](backend/app/llmsuite/client.py:1)
- [`structured.py`](backend/app/llmsuite/structured.py:1)
- [`routes.py`](backend/app/llmsuite/routes.py:1)

### Near-term replacement sequence
1. Replace the stub internals in [`LLMSuiteSessionManager`](backend/app/llmsuite/session.py:1) with Playwright persistent-profile logic.
2. Replace the placeholder identity/model discovery with real JS extracted from the browser console flow.
3. Keep [`LLMSuiteProxyClient`](backend/app/llmsuite/client.py:1) public methods stable so the frontend does not change.
4. Upgrade [`LLMSuiteStructuredClient`](backend/app/llmsuite/structured.py:1) from schema-shaped placeholder output to real parse/repair/validation behavior.

## Frontend architecture path
### Present reusable pieces
- [`LLMChatAnalystWorkspaceShell`](frontend/src/components/llmChat/LLMChatAnalystWorkspaceShell.tsx:1)
- [`LLMChatConversationTranscript`](frontend/src/components/llmChat/LLMChatConversationTranscript.tsx:1)
- [`LLMChatMessageComposer`](frontend/src/components/llmChat/LLMChatMessageComposer.tsx:1)
- [`LLMChatScreeningContextInspector`](frontend/src/components/llmChat/LLMChatScreeningContextInspector.tsx:1)
- [`LLMChatStructuredOutputPreviewCard`](frontend/src/components/llmChat/LLMChatStructuredOutputPreviewCard.tsx:1)

### Near-term upgrade path
1. Add deployment selectors and model selectors beside the workspace header once provider discovery is real.
2. Swap the stub response transcript with markdown rendering and optional JSON-only view.
3. Replace the simple structured-output preview with the final JSON schema once output shape is decided.
4. Add a dedicated warnings/debug panel for `rate_limited`, `json_repair_attempted`, and `partial_structured_output` warnings.

## Start Screening → LLM Chat payload flow
### Current flow
1. Analyst edits screening draft.
2. Analyst clicks [`Start Screening`](frontend/src/pages/ScreeningDetailPage.tsx:147).
3. Backend returns the screening payload stub.
4. Frontend navigates to [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1).
5. [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1) auto-sends the payload through the generic chat endpoint and keeps the JSON in a visible context panel.

### Future flow
1. Same handoff trigger.
2. Payload is also registered under a stable `conversationId` + `deploymentId` pair.
3. The first request should likely use [`structured.create(...)`](backend/app/llmsuite/structured.py:1) rather than plain chat once the JSON output contract is defined.

## Recommended next step after the stub
Define the first structured output schema for the post-screening chat route. Once that schema exists, the first auto-sent request from [`LLMChatPage`](frontend/src/pages/LLMChatPage.tsx:1) should move from generic chat to the structured endpoint so the workspace immediately produces analyst-reviewable JSON.
