import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, MessageCircleQuestion, ListChecks, ChevronRight, InfoIcon, Upload, Expand, ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import ReactMarkdown from 'react-markdown';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Accordion, AccordionItem, AccordionContent } from '../components/ui/accordion';
import { Textarea } from '../components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../components/ui/dialog';
import { cn } from '../lib/utils';
import {
  analyzeCriteria,
  createLLMSuiteChatCompletion,
  getActiveScreening,
  listLLMSuiteModels,
  markCriteriaProgress,
  refineCriteria,
  rerunCriteriaAnalysis,
} from '../api/endpoints';
import { useScreenStore } from '../stores/screenStore';
import { useSearchStore, type Keyword } from '../stores/searchStore';
import type { LLMSuiteChatMessage, LLMSuiteModelInfo } from '../api/types';

/* ─── Types ─── */
interface CriteriaColumn { key: string; label: string }
interface CriteriaRow { [k: string]: string }
interface CriteriaTable { columns: CriteriaColumn[]; rows: CriteriaRow[] }
interface CriteriaText { type: 'bullet_list' | 'paragraph'; items: string[] }
interface InitialUnderstanding { table: CriteriaTable; text: CriteriaText }
interface CriteriaQuestion { id: string; category: string; question_concise: string; question_detailed?: string; answer: string | null }
interface FinalCriteria { content_markdown: string }
interface CriteriaChatMessage { id: string; role: 'user' | 'assistant'; content: string }

interface CriteriaPayload {
  initial_understanding: InitialUnderstanding;
  questions: CriteriaQuestion[];
  current_final_criteria: FinalCriteria;
}

type CriteriaAnalysisPayload = CriteriaPayload & {
  screening_id?: string | null;
  pipeline_step?: number;
  pipeline_status?: string;
  criteria_completed?: boolean;
};

interface NavigationState {
  seededScreeningPayload?: Record<string, any>;
  sourceScreeningId?: string;
  sourcePdfName?: string;
}

type CriteriaStage = 'analyze' | 'finalize' | 'keywords' | 'chat';

/* ─── Mock data (used when no backend) ─── */
const MOCK_PAYLOAD: CriteriaPayload = {
  initial_understanding: {
    table: {
      columns: [
        { key: 'criteria_part', label: 'Criteria Part' },
        { key: 'value', label: 'Value' },
      ],
      rows: [
        { criteria_part: 'Business Model', value: 'Subscription-based SaaS' },
        { criteria_part: 'Target Customer', value: 'Enterprise finance teams' },
      ],
    },
    text: {
      type: 'bullet_list',
      items: [
        'The company likely serves B2B customers.',
        'The offering appears to be software-led.',
        'More evidence is required from product and pricing pages.',
      ],
    },
  },
  questions: [
    {
      id: 'q1',
      category: 'blocker',
      question_concise: 'Does the company provide ISO 27001 certification services?',
      question_detailed: '',
      answer: null,
    },
    {
      id: 'q2',
      category: 'general',
      question_concise: 'What services does the company offer?',
      question_detailed: '',
      answer: null,
    },
    {
      id: 'q3',
      category: 'general',
      question_concise: 'Which industries does the company serve?',
      question_detailed: '',
      answer: null,
    },
  ],
  current_final_criteria: {
    content_markdown: "- Must be a **Certification Body / Registrar / Provider** of certification services.\n- Must provide at least one target certification such as **ISO 9001**, **ISO 14001**, **ISO 45001**, **ISO 27001**, **ISO 50001**, or **ISO 20000-1**.\n- Must serve customers in the **US and/or Canada**.\n- Should not be only a consulting firm unless it also directly provides **certification, audit, or registrar services**.\n- <u>Exclude companies that only provide training, software, or advisory services without issuing certifications.</u>",
  },
};

function extractCriteriaErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  const message = error?.response?.data?.error?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return fallback;
}

/* ─── Icon trigger for accordion ─── */
function AccordionIconTrigger({
  icon: Icon,
  title,
  subtitle,
  stepNumber,
  completed,
  disabled,
  className,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  stepNumber: number;
  completed?: boolean;
  disabled?: boolean;
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex flex-1 items-center justify-between gap-4 rounded-xl py-4 px-2 text-left text-sm font-medium transition-all outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-40",
          className,
        )}
        disabled={disabled}
        {...props}
      >
        <span className="flex items-center gap-4">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              completed
                ? "border-green-500 bg-green-500/10 text-green-600"
                : "border-brand/30 bg-brand/5 text-brand"
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-tertiary">
                Step {stepNumber}
              </span>
            </span>
            <span className="text-base font-semibold text-foreground">{title}</span>
            <span className="text-xs text-text-secondary font-normal">{subtitle}</span>
          </span>
        </span>
        <ChevronRight
          className={cn(
            "size-5 text-text-tertiary shrink-0 transition-transform duration-200",
            "group-aria-expanded/accordion-trigger:rotate-90"
          )}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/* ─── Simple data table ─── */
function CriteriaTable({ table }: { table: CriteriaTable }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-1 border-b">
            {table.columns.map(col => (
              <th
                key={col.key}
                className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-surface-1/60 transition-colors">
              {table.columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-text-primary">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Bullet list ─── */
function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 mt-4">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary leading-relaxed">
          <span className="mt-1.5 size-1.5 rounded-full bg-brand shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ─── Page ─── */
export function CriteriaAnalysisPage() {
  const navigate = useNavigate();
  const { screeningId } = useParams<{ screeningId?: string }>();
  const location = useLocation();
  const navState = (location.state as NavigationState | null) ?? null;
  const activeScreen = useScreenStore((state) => state.activeScreen);
  const updateScreen = useScreenStore((state) => state.updateScreen);

  const QUESTIONS_SECTION_ID = 'criteria-questions-section';
  const FINAL_SECTION_ID = 'criteria-final-section';
  const QUESTIONS_FIRST_ROW_ID = 'criteria-first-question-row';
  const FINAL_CONTENT_ID = 'criteria-final-content';

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<CriteriaPayload | null>(null);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [questions, setQuestions] = useState<CriteriaQuestion[]>([]);
  const [questionsVisible, setQuestionsVisible] = useState(false);
  const [finalVisible, setFinalVisible] = useState(false);
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([]);
  const [loadErrorStage, setLoadErrorStage] = useState<CriteriaStage | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<CriteriaChatMessage[]>([]);
  const [conversationId] = useState(() => crypto.randomUUID());
  const [availableModels, setAvailableModels] = useState<LLMSuiteModelInfo[]>([]);
  const [criteriaScreeningId, setCriteriaScreeningId] = useState<string | null>(
    navState?.sourceScreeningId ?? screeningId ?? activeScreen?.id ?? null,
  );
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [isRerunningCriteria, setIsRerunningCriteria] = useState(false);
  const bootstrappedRef = useRef(false);
  const setKeywords = useSearchStore((state) => state.setKeywords);
  const setQueryExpression = useSearchStore((state) => state.setQueryExpression);
  const effectiveScreeningId = criteriaScreeningId ?? navState?.sourceScreeningId ?? screeningId ?? activeScreen?.id ?? null;

  const scrollTargetIntoPageView = useCallback((targetId: string, topOffset = 24) => {
    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const scrollContainer = target.closest('.overflow-auto');
      if (!(scrollContainer instanceof HTMLElement)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const nextScrollTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - topOffset;

      scrollContainer.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: 'smooth',
      });
    }, 250);
  }, []);

  const stubGeneratedKeywords = useCallback((): Keyword[] => {
    const base = [
      'ISO 27001 certification',
      'certification body registrar',
      'ISO audit services',
    ];
    return base.map((keyword, index) => ({
      id: crypto.randomUUID(),
      keyword,
      mode: 'lexical',
      action: 'include',
      weight: 1,
      serial: index + 1,
    }));
  }, []);

  const clearStageError = useCallback(() => {
    setLoadErrorStage(null);
    setLoadErrorMessage(null);
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const models = await listLLMSuiteModels();
      setAvailableModels(models);
    } catch {
      setAvailableModels([]);
    }
  }, []);

  const applyCriteriaPayload = useCallback((data: CriteriaAnalysisPayload, fallbackScreeningId?: string | null) => {
    const nextScreeningId = data.screening_id ?? fallbackScreeningId ?? null;
    const step = Number(data.pipeline_step ?? 1);
    const criteriaCompleted = Boolean(data.criteria_completed) || step >= 4;
    const shouldShowQuestions = criteriaCompleted || step >= 3;
    const shouldShowFinal = criteriaCompleted;

    setCriteriaScreeningId(nextScreeningId);
    setPayload(data);
    setQuestions(data.questions.map(q => ({ ...q })));
    setQuestionsVisible(shouldShowQuestions);
    setFinalVisible(shouldShowFinal);
    setOpenSections(shouldShowFinal ? ['final'] : shouldShowQuestions ? ['questions'] : ['initial']);
  }, []);

  /* Load data — try backend first, then fall back to mock */
  const loadCriteria = useCallback(async () => {
    setLoading(true);
    clearStageError();
    try {
      let sid = navState?.sourceScreeningId ?? screeningId ?? activeScreen?.id ?? null;
      if (!sid) {
        try {
          const active = await getActiveScreening();
          sid = active.id;
          navigate(`/criteria-analysis/${sid}`, { replace: true });
        } catch {
          throw new Error('no-active-screen');
        }
      }
      const data = await analyzeCriteria({
        screening_id: sid,
        screening_payload: navState?.seededScreeningPayload ?? null,
      });
      applyCriteriaPayload(data, sid);
    } catch (error: any) {
      if (error instanceof Error && error.message === 'no-active-screen') {
        toast.error('No screen is activated. Please activate a screen from the screening page first.');
        navigate('/', { replace: true });
        setPayload(null);
        setQuestions([]);
        return;
      }

      const detail = error?.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : typeof error?.response?.data?.error?.message === 'string'
          ? error.response.data.error.message
          : null;

      if (message) {
        setLoadErrorStage('analyze');
        setLoadErrorMessage(message);
        toast.error(message || 'No screen is activated.');
        navigate('/', { replace: true });
        setPayload(null);
        setQuestions([]);
        return;
      }

      applyCriteriaPayload(MOCK_PAYLOAD, criteriaScreeningId);
    } finally {
      setLoading(false);
    }
  }, [screeningId, navState, navigate, activeScreen?.id, clearStageError, applyCriteriaPayload, criteriaScreeningId]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void loadCriteria();
  }, [loadCriteria]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  const handleShowQuestions = useCallback(async () => {
    clearStageError();
    setQuestionsVisible(true);
    setOpenSections(['initial', 'questions']);
    scrollTargetIntoPageView(QUESTIONS_FIRST_ROW_ID);
    if (!effectiveScreeningId) return;
    try {
      const response = await markCriteriaProgress({ screening_id: effectiveScreeningId, stage: 'questions' });
      setCriteriaScreeningId(response.screening_id ?? effectiveScreeningId);
      updateScreen(effectiveScreeningId, { pipelineStep: 'Criteria Analysis', pipelineStatus: 'active' });
    } catch (error: any) {
      toast.error(extractCriteriaErrorMessage(error, 'Failed to save criteria-analysis progress.'));
    }
  }, [clearStageError, effectiveScreeningId, scrollTargetIntoPageView, updateScreen]);

  const handleShowFinal = useCallback(async () => {
    // Check if any blocker questions are unanswered
    const unansweredBlockers = questions.filter(
      q => q.category === 'blocker' && (!q.answer || q.answer.trim() === '')
    );

    if (unansweredBlockers.length > 0) {
      toast.error('Blocker questions cannot be empty!');
      return;
    }

    clearStageError();
    setIsGeneratingFinal(true);
    setOpenSections(['questions']);

    try {
      if (effectiveScreeningId) {
        const response = await refineCriteria({
          screening_id: effectiveScreeningId,
          answers: questions.map((q) => ({ id: q.id, answer: q.answer || '' })),
        });
        const answersById = new Map(questions.map((q) => [q.id, q.answer]));
        applyCriteriaPayload({
          ...response,
          questions: response.questions.map((q) => ({ ...q, answer: answersById.get(q.id) ?? q.answer })),
        }, effectiveScreeningId);
        updateScreen(effectiveScreeningId, {
          pipelineStep: 'Search',
          pipelineStatus: 'active',
          investmentCriteria: response.current_final_criteria.content_markdown,
          currFinalCriteria: response.current_final_criteria.content_markdown,
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      setFinalVisible(true);
      setOpenSections(['final']);
      scrollTargetIntoPageView(FINAL_CONTENT_ID);
    } catch (error: any) {
      setLoadErrorStage('finalize');
      setLoadErrorMessage(extractCriteriaErrorMessage(error, 'Failed to generate final screening criteria.'));
    } finally {
      setIsGeneratingFinal(false);
    }
  }, [questions, clearStageError, effectiveScreeningId, applyCriteriaPayload, scrollTargetIntoPageView, updateScreen])

  const handleGenerateKeywords = async () => {
    clearStageError();
    setIsGeneratingKeywords(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (effectiveScreeningId) {
        await markCriteriaProgress({ screening_id: effectiveScreeningId, stage: 'keywords' });
      }
      const generatedKeywords = stubGeneratedKeywords();
      setKeywords(generatedKeywords);
      setQueryExpression('1 OR 2 OR 3');
      navigate('/search', {
        state: {
          autoApplyKeywords: true,
          generatedKeywords,
          generatedQueryExpression: '1 OR 2 OR 3',
        },
      });
    } catch (error: any) {
      setLoadErrorStage('keywords');
      setLoadErrorMessage(extractCriteriaErrorMessage(error, 'Failed to generate keywords.'));
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const handleRetry = useCallback(() => {
    if (loadErrorStage === 'analyze') {
      void loadCriteria();
      return;
    }
    if (loadErrorStage === 'finalize') {
      void handleShowFinal();
      return;
    }
    if (loadErrorStage === 'keywords') {
      void handleGenerateKeywords();
      return;
    }
  }, [handleGenerateKeywords, handleShowFinal, loadErrorStage, loadCriteria]);

  const handleConfirmRerunCriteria = useCallback(async () => {
    if (!effectiveScreeningId) {
      toast.error('No active screening is available to re-run criteria analysis.');
      return;
    }

    clearStageError();
    setIsRerunningCriteria(true);
    try {
      const response = await rerunCriteriaAnalysis(effectiveScreeningId);
      applyCriteriaPayload(response, effectiveScreeningId);
      setExpandedQuestions([]);
      setChatMessages([]);
      setChatMessage('');
      setIsRerunDialogOpen(false);
      updateScreen(effectiveScreeningId, {
        pipelineStep: 'Criteria Analysis',
        pipelineStatus: 'active',
        investmentCriteria: 'No criteria saved yet.',
        currFinalCriteria: null,
      });
      toast.success('Criteria analysis was reset. The database will now resume from the first criteria step.');
    } catch (error: any) {
      toast.error(extractCriteriaErrorMessage(error, 'Failed to reset criteria analysis.'));
    } finally {
      setIsRerunningCriteria(false);
    }
  }, [applyCriteriaPayload, clearStageError, effectiveScreeningId, updateScreen]);

  const handleSendChat = useCallback(async () => {
    if (!chatMessage.trim()) return;
    clearStageError();
    setIsSendingChat(true);
    const userContent = chatMessage.trim();
    try {
      const userMessage: CriteriaChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent };
      setChatMessages((current) => [...current, userMessage]);
      const payloadMessages: LLMSuiteChatMessage[] = [
        {
          role: 'system',
          content: payload?.current_final_criteria.content_markdown || '',
          metadata: { route: 'criteria-analysis' },
        },
        {
          role: 'user',
          content: userContent,
          metadata: { workflowStep: 'criteria-analysis-chat' },
        },
      ];

      const response = await createLLMSuiteChatCompletion({
        deploymentId: 'company-screening-assistant-v1-stub',
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
          route: 'criteria-analysis',
          linkedScreeningId: effectiveScreeningId,
        },
      });

      const assistantContent = response.message.content || `Stub response: I would refine the final criteria based on "${userContent}". For UI testing, this message demonstrates a bidirectional LLM reply.`;
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: assistantContent },
      ]);
      setChatMessage('');
      if (response.warnings.length > 0) {
        toast.info(response.warnings.map((warning) => warning.message).join(' '));
      }
    } catch (error: any) {
      const assistantContent = `Stub response: I would refine the criteria using your request, "${userContent}". This fallback appears when the LLM stub is unavailable.`;
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: assistantContent },
      ]);
      setChatMessage('');
      toast.info('LLM stub unavailable, showing local stub response for chat UI testing.');
    } finally {
      setIsSendingChat(false);
    }
  }, [
    availableModels,
    chatMessage,
    clearStageError,
    conversationId,
    effectiveScreeningId,
    navState?.sourceScreeningId,
    payload?.current_final_criteria.content_markdown,
  ]);

  const handleQuestionChange = (id: string, value: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, answer: value } : q));
  };

  const toggleQuestion = (id: string) => {
    setExpandedQuestions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-surface-1">
        <PageHeader title="Criteria Analysis" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-brand" />
            <p className="text-sm text-text-secondary animate-pulse">Analyzing screening criteria…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-surface-1">
        <PageHeader title="Criteria Analysis" />
        <div className="flex-1 flex items-center justify-center text-sm text-text-secondary">
          No screening data available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Criteria Analysis">
        <Dialog open={isRerunDialogOpen} onOpenChange={setIsRerunDialogOpen}>
          <DialogTrigger render={
            <Button variant="outline" size="sm" className="gap-2" disabled={!effectiveScreeningId || isRerunningCriteria} />
          }>
            <RotateCcw className="size-4" /> Repeat
          </DialogTrigger>
          <DialogContent showCloseButton className="!max-w-md !w-[440px]">
            <DialogHeader>
              <DialogTitle>Re-run criteria analysis from scratch?</DialogTitle>
              <DialogDescription>
                This will reset the saved criteria-analysis progress for this active screen, clear the current final criteria in the database, and start again from the initial understanding step.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" disabled={isRerunningCriteria} />}>
                Cancel
              </DialogClose>
              <Button
                onClick={handleConfirmRerunCriteria}
                disabled={isRerunningCriteria || !effectiveScreeningId}
                className="bg-danger text-white hover:bg-danger/90"
              >
                {isRerunningCriteria && <Loader2 className="mr-2 size-4 animate-spin" />}
                Re-run from scratch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {navState?.sourceScreeningId && (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/screenings/${navState.sourceScreeningId}`)} className="text-text-secondary gap-2">
            <ArrowLeft className="size-4" /> Back to Screening Draft
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto p-8 relative">
        {/* Loading Overlay when generating keywords */}
        {isGeneratingKeywords && (
          <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="size-10 animate-spin text-brand mb-4" />
            <p className="text-lg font-medium text-foreground">Generating Keywords...</p>
          </div>
        )}

        {loadErrorStage && loadErrorMessage && (
          <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            <div>
              <div className="font-semibold">Request failed</div>
              <div>{loadErrorMessage}</div>
            </div>
            {loadErrorStage !== 'chat' && (
              <Button variant="outline" size="sm" className="shrink-0" onClick={handleRetry}>
                <RotateCcw className="mr-2 size-4" /> Try again
              </Button>
            )}
          </div>
        )}

        <div className="w-[95%] max-w-none mx-auto space-y-2">
          <Accordion
            value={openSections}
            onValueChange={setOpenSections}
            className="space-y-3"
          >
            {/* ── Section A: Initial Understanding ── */}
            <AccordionItem value="initial" className="rounded-xl border bg-surface-0 shadow-sm overflow-hidden px-4">
              <AccordionIconTrigger
                icon={Sparkles}
                title="Initial Understanding"
                subtitle="LLM-generated summary from the screening criteria document"
                stepNumber={1}
                completed={questionsVisible}
              />
              <AccordionContent className="px-2 pb-4">
                <div className="space-y-4">
                  <CriteriaTable table={payload.initial_understanding.table} />
                  <BulletList items={payload.initial_understanding.text.items} />

                  {!questionsVisible && (
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleShowQuestions}
                        className="bg-brand text-brand-fg hover:bg-brand-hover gap-2"
                      >
                        <MessageCircleQuestion className="size-4" />
                        Continue to Questions
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Section B: Questions ── */}
            {questionsVisible && (
              <AccordionItem
                id={QUESTIONS_SECTION_ID}
                value="questions"
                className="scroll-mt-8 rounded-xl border bg-surface-0 shadow-sm overflow-hidden px-4"
              >
                <AccordionIconTrigger
                  icon={MessageCircleQuestion}
                  title="Questions to be Answered"
                  subtitle="Answer these questions to refine the screening criteria"
                  stepNumber={2}
                  completed={finalVisible}
                />
                <AccordionContent className="px-2 pb-4">
                  <div className="space-y-6">
                    {questions.map((q, i) => (
                      <div
                        key={q.id}
                        id={i === 0 ? QUESTIONS_FIRST_ROW_ID : undefined}
                        className="grid grid-cols-2 gap-8 items-start border-b border-border/50 pb-6 last:border-0 last:pb-0"
                      >
                        {/* Left part: concise question and expandable detail */}
                        <div className="flex flex-col gap-3">
                          <div 
                            className="flex items-start gap-3 cursor-pointer select-none group" 
                            onClick={() => toggleQuestion(q.id)}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-sm font-bold mt-0.5 group-hover:bg-brand group-hover:text-white transition-colors">
                              {i + 1}
                            </span>
                            <p className="text-[15px] font-medium text-foreground leading-snug mt-1 group-hover:text-brand transition-colors">
                              {q.question_concise}
                            </p>
                          </div>
                          {expandedQuestions.includes(q.id) && (
                            <div className="ml-10 text-sm text-text-secondary bg-surface-0 p-3 rounded-lg border border-border shadow-sm">
                              <p className="font-semibold text-foreground mb-1 text-xs uppercase tracking-wider">Detailed Context</p>
                              {q.question_detailed || 'This is random detailed text from the backend providing additional context about why this question is necessary and what specific information you should focus on while answering.'}
                            </div>
                          )}
                        </div>

                        {/* Right part: answer input */}
                        <div className="relative overflow-hidden rounded-lg border border-border bg-surface-0 transition-colors focus-within:border-brand/40">
                          {q.category === 'blocker' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger render={<button className="absolute top-3 right-3 rounded-full p-1 bg-surface-0 hover:bg-surface-1 z-10 transition-colors" />}>
                                  <InfoIcon className="size-4 text-red-500" />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>BLOCKER: Must be answered</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Textarea
                            value={q.answer || ''}
                            onChange={e => handleQuestionChange(q.id, e.target.value)}
                            placeholder="Type your answer…"
                            className="min-h-[80px] border-0 bg-transparent shadow-none resize-none pr-12 text-sm focus-visible:border-transparent focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    ))}

                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleShowFinal}
                        disabled={isGeneratingFinal}
                        className="bg-brand text-brand-fg hover:bg-brand-hover gap-2"
                      >
                        {isGeneratingFinal ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ListChecks className="size-4" />
                        )}
                        {isGeneratingFinal ? 'Generating Final Screening Criteria…' : 'Generate Final Criteria'}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ── Section C: Final Screening Criteria ── */}
            {finalVisible && (
              <AccordionItem
                id={FINAL_SECTION_ID}
                value="final"
                className="scroll-mt-8 rounded-xl border bg-surface-0 shadow-sm overflow-hidden px-4"
              >
                <AccordionIconTrigger
                  icon={ListChecks}
                  title="Final Screening Criteria"
                  subtitle="Refined criteria ready for screening execution"
                  stepNumber={3}
                  completed={false}
                />
                <AccordionContent className="px-2 pb-4">
                  <div className="space-y-6">
                    <div
                      id={FINAL_CONTENT_ID}
                      className="prose prose-sm max-w-none text-text-primary prose-strong:text-foreground prose-a:text-brand bg-surface-1/50 p-6 rounded-lg border"
                    >
                      <ReactMarkdown>
                        {payload.current_final_criteria.content_markdown}
                      </ReactMarkdown>
                    </div>

                    <div className="pt-4 border-t space-y-4">
                      <div className="max-h-72 space-y-3 overflow-auto rounded-xl border bg-surface-0 p-4">
                        {chatMessages.length === 0 ? (
                          <div className="text-sm text-text-tertiary italic">Ask the LLM to refine or explain the final screening criteria. Stub replies will appear here.</div>
                        ) : (
                          chatMessages.map((message) => (
                            <div
                              key={message.id}
                              className={cn(
                                'rounded-lg px-3 py-2 text-sm leading-6',
                                message.role === 'user'
                                  ? 'ml-auto max-w-[78%] bg-brand text-brand-fg'
                                  : 'mr-auto max-w-[78%] bg-surface-1 text-text-primary border',
                              )}
                            >
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                                {message.role === 'user' ? 'You' : 'LLM Stub'}
                              </div>
                              {message.content}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Textarea 
                            value={chatMessage}
                            onChange={e => setChatMessage(e.target.value)}
                            placeholder="Ask a question or refine the criteria…" 
                            className="min-h-[52px] border-border resize-none pr-10 bg-surface-0 shadow-none focus-visible:border-brand/40 focus-visible:ring-0"
                          />
                          <Dialog>
                            <DialogTrigger render={
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute right-2 top-2 size-8 text-text-tertiary hover:text-foreground"
                                title="Expand Editor"
                              />
                            }>
                              <Expand className="size-4" />
                            </DialogTrigger>
                            <DialogContent className="h-[80vh] w-[min(70vw,1280px)] max-w-[calc(100vw-2rem)] p-6 sm:max-w-[min(70vw,1280px)] flex flex-col">
                              <DialogHeader>
                                <DialogTitle>Expanded Chat Editor</DialogTitle>
                              </DialogHeader>
                              <div className="flex-1 overflow-auto mt-4">
                                <Textarea 
                                  value={chatMessage}
                                  onChange={e => setChatMessage(e.target.value)}
                                  placeholder="Ask a question or refine the criteria…" 
                                  className="min-h-full h-full border-border bg-surface-1 resize-none p-6 text-base shadow-none focus-visible:border-brand/40 focus-visible:ring-0"
                                />
                              </div>
                              <DialogFooter className="mt-6 border-none px-0">
                                <DialogClose render={<Button variant="outline" />}>
                                  Done
                                </DialogClose>
                                <Button className="bg-brand text-brand-fg hover:bg-brand-hover gap-2" onClick={handleSendChat} disabled={isSendingChat}>
                                  {isSendingChat ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Send
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <Button className="h-[52px] w-[52px] shrink-0 bg-brand text-brand-fg hover:bg-brand-hover shadow-sm" onClick={handleSendChat} disabled={isSendingChat || !chatMessage.trim()}>
                          {isSendingChat ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                        </Button>
                        <Button 
                          onClick={handleGenerateKeywords}
                          disabled={isGeneratingKeywords}
                          className="h-[52px] px-6 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                        >
                          Generate Keywords
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
