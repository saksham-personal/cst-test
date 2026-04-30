import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Activity, Bot, MessageSquare, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type {
  LLMSuiteChatMessage,
  LLMSuiteHealthStatus,
  LLMSuiteModelInfo,
} from '../api/types';
import {
  createLLMSuiteChatCompletion,
  getLLMSuiteHealth,
  listLLMSuiteModels,
} from '../api/endpoints';
import { PageHeader } from '../components/layout/PageHeader';
import { LLMChatAnalystWorkspaceShell } from '../components/llmChat/LLMChatAnalystWorkspaceShell';
import {
  LLMChatConversationTranscript,
  type LLMChatTranscriptMessage,
} from '../components/llmChat/LLMChatConversationTranscript';
import { LLMChatMessageComposer } from '../components/llmChat/LLMChatMessageComposer';
import { LLMChatScreeningContextInspector } from '../components/llmChat/LLMChatScreeningContextInspector';
import { LLMChatStructuredOutputPreviewCard } from '../components/llmChat/LLMChatStructuredOutputPreviewCard';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

interface LLMChatNavigationState {
  seededScreeningPayload?: Record<string, any>;
  sourceScreeningId?: string;
  sourcePdfName?: string;
}

export function LLMChatPage() {
  const { screeningId } = useParams<{ screeningId?: string }>();
  const location = useLocation();
  const navigationState = (location.state as LLMChatNavigationState | null) ?? null;

  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<LLMChatTranscriptMessage[]>([
    {
      id: 'welcome-assistant',
      role: 'assistant',
      caption: 'Stub deployment ready',
      content: 'Welcome to the LLM Chat workspace. The provider is currently stubbed, but the route, payload handoff, health banner, and transcript flow are all ready for the real LLMSuite proxy.',
    },
  ]);
  const [composerValue, setComposerValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [health, setHealth] = useState<LLMSuiteHealthStatus | null>(null);
  const [availableModels, setAvailableModels] = useState<LLMSuiteModelInfo[]>([]);
  const [structuredPreviewJson, setStructuredPreviewJson] = useState<Record<string, any> | null>(null);
  const bootstrappedScreeningRef = useRef(false);

  const seededScreeningPayload = navigationState?.seededScreeningPayload ?? null;
  const effectiveScreeningId = navigationState?.sourceScreeningId ?? screeningId ?? null;
  const sourcePdfName = navigationState?.sourcePdfName ?? null;

  const deploymentId = useMemo(() => 'company-screening-assistant-v1-stub', []);

  const refreshMetadata = useCallback(async () => {
    const [healthResponse, modelsResponse] = await Promise.all([
      getLLMSuiteHealth(),
      listLLMSuiteModels(),
    ]);
    setHealth(healthResponse);
    setAvailableModels(modelsResponse);
  }, []);

  useEffect(() => {
    void refreshMetadata();
  }, [refreshMetadata]);

  const sendChatMessage = useCallback(async (userMessage: string, extraMetadata: Record<string, any> = {}) => {
    const nextUserMessage: LLMChatTranscriptMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
    };
    const transcriptForRequest = [...messages, nextUserMessage];
    setMessages(transcriptForRequest);
    setIsSending(true);

    try {
      const payloadMessages: LLMSuiteChatMessage[] = transcriptForRequest.map((message) => ({
        role: message.role,
        content: message.content,
        metadata: message.caption ? { caption: message.caption } : {},
      }));

      const response = await createLLMSuiteChatCompletion({
        deploymentId,
        conversationId,
        messages: payloadMessages,
        modelConfig: {
          model: availableModels[0]?.modelId || 'stub-screening-model',
          temperature: 0.2,
          thinking: false,
        },
        toolsEnabled: false,
        sourcesEnabled: false,
        metadata: {
          route: 'llm-chat',
          linkedScreeningId: effectiveScreeningId,
          screeningPayload: seededScreeningPayload,
          ...extraMetadata,
        },
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          caption: response.warnings.length ? `${response.warnings.length} warning(s)` : 'Stub response',
          content: response.message.content,
        },
      ]);

      if (response.warnings.length > 0) {
        toast.info(response.warnings.map((warning) => warning.message).join(' '));
      }
    } catch {
      toast.error('Failed to contact the LLMSuite stub');
    } finally {
      setIsSending(false);
      setComposerValue('');
      void refreshMetadata();
    }
  }, [availableModels, composerValue, conversationId, deploymentId, effectiveScreeningId, messages, refreshMetadata, seededScreeningPayload]);

  useEffect(() => {
    if (!seededScreeningPayload || bootstrappedScreeningRef.current) return;
    bootstrappedScreeningRef.current = true;
    setStructuredPreviewJson(seededScreeningPayload);
    const bootstrapMessage = [
      'The analyst pressed Start Screening.',
      'Treat the following screening payload as attached conversation context for future LLM calls.',
      '```json',
      JSON.stringify(seededScreeningPayload, null, 2),
      '```',
    ].join('\n');
    void sendChatMessage(bootstrapMessage, {
      workflowStep: 'screening_start_handoff',
      handoffSource: 'ScreeningDetailPage',
    });
  }, [seededScreeningPayload, sendChatMessage]);

  const header = (
    <PageHeader title="LLM Chat">
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5">
          <Activity className="size-4 text-brand" />
          <span>{health?.authenticated ? 'Stub session ready' : 'Stub session booting'}</span>
        </div>
      </div>
    </PageHeader>
  );

  const mainContent = (
    <>
      <div className="border-b bg-gradient-to-r from-brand/10 via-white to-accent-purple/10 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              <Sparkles className="size-4" />
              Analyst AI Workspace
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-text-primary">Company Screening Assistant</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              This route is the future home for screening-specific chat, structured criteria understanding, and guided analyst follow-up. The current provider is a stub, but the route, health model, and screening handoff are intentionally wired now.
            </p>
          </div>
          <Card className="hidden min-w-[280px] border-brand/20 bg-white/90 lg:block">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="size-4 text-accent-purple" />
                Active Stub Deployment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-text-secondary">
              <div>Deployment: <span className="font-medium text-text-primary">{deploymentId}</span></div>
              <div>Conversation: <span className="font-mono text-xs text-text-primary">{conversationId}</span></div>
              <div>Model: <span className="font-medium text-text-primary">{availableModels[0]?.displayName || 'Stub Screening Model'}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <LLMChatConversationTranscript messages={messages} isSending={isSending} />
      <LLMChatMessageComposer
        value={composerValue}
        onChange={setComposerValue}
        onSubmit={() => {
          if (!composerValue.trim()) return;
          void sendChatMessage(composerValue, { workflowStep: 'manual_analyst_chat' });
        }}
        disabled={isSending}
      />
    </>
  );

  const secondaryContent = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4 text-accent-teal" />
            Provider Health Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text-secondary">
          <div>Authenticated: <span className="font-medium text-text-primary">{health?.authenticated ? 'Yes' : 'No'}</span></div>
          <div>Queue depth: <span className="font-medium text-text-primary">{health?.currentQueueDepth ?? 0}</span></div>
          <div>Seconds until next request: <span className="font-medium text-text-primary">{health?.secondsUntilNextRequest?.toFixed(1) ?? '0.0'}</span></div>
          <div>Available models: <span className="font-medium text-text-primary">{availableModels.length}</span></div>
        </CardContent>
      </Card>

      <LLMChatScreeningContextInspector
        screeningId={effectiveScreeningId}
        sourcePdfName={sourcePdfName}
        payload={seededScreeningPayload}
      />

      <LLMChatStructuredOutputPreviewCard outputJson={structuredPreviewJson} />
    </>
  );

  return (
    <LLMChatAnalystWorkspaceShell
      header={header}
      mainContent={mainContent}
      secondaryContent={secondaryContent}
    />
  );
}

