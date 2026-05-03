import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Checkbox } from '../components/ui/checkbox';
import { cn } from '../lib/utils';
import { PlatformScreenFlow } from '../components/llmScreening/PlatformScreenFlow';
import { IndependentUseCaseFlow } from '../components/llmScreening/IndependentUseCaseFlow';
import { Monitor, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

interface LLMScreeningNavigationState {
  flow?: 'platform' | 'independent';
  prompts?: Partial<Record<'Yes' | 'No' | 'Maybe' | 'Rationale', string>>;
  screeningId?: string | null;
  listName?: string | null;
  needsPromptFill?: boolean;
}

export function LLMScreeningPage() {
  const location = useLocation();
  const navState = (location.state as LLMScreeningNavigationState | null) ?? null;
  const [activeFlow, setActiveFlow] = useState<'platform' | 'independent' | null>(navState?.flow ?? null);
  const [rationaleEnabled, setRationaleEnabled] = useState(true);
  const [hideFlowCards, setHideFlowCards] = useState(Boolean(navState?.flow));
  const navigationKey = useMemo(
    () => `${navState?.listName ?? ''}:${navState?.screeningId ?? ''}:${Object.keys(navState?.prompts ?? {}).join('|')}`,
    [navState?.listName, navState?.prompts, navState?.screeningId],
  );

  const handleFlowActivityStart = useCallback(() => {
    setHideFlowCards(true);
  }, []);

  useEffect(() => {
    if (!navState) return;
    if (navState.flow) {
      setActiveFlow(navState.flow);
      setHideFlowCards(true);
    }
    if (navState.needsPromptFill) {
      toast.info('This list is not associated with a screen. Fill the Yes/No/Maybe prompts before running LLM Screening.');
    } else if (navState.prompts) {
      toast.success('Generated prompts loaded. Review and edit prompts before starting.');
    }
  }, [navState, navigationKey]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="LLM Screening" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6 xl:max-w-[70vw]">
          {/* Rationale checkbox — anchored top-right with card context */}
          <div className="flex items-center justify-end">
            <label
              htmlFor="rationale-toggle"
              className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border px-4 py-2.5 bg-surface-0 hover:bg-surface-2"
            >
              <Checkbox
                id="rationale-toggle"
                checked={rationaleEnabled}
                onCheckedChange={(checked) => setRationaleEnabled(!!checked)}
              />
              <span className="text-sm font-semibold text-foreground">
                Include Rationale
              </span>
            </label>
          </div>

          {/* Flow Toggle Cards */}
          {!hideFlowCards && (
          <div className="grid grid-cols-2 gap-5">
            <button
              type="button"
              onClick={() => setActiveFlow('platform')}
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-6 py-8 bg-surface-0 cursor-pointer outline-none hover:shadow-sm",
                activeFlow === 'platform'
                  ? "border-brand shadow-md"
                  : "border-border hover:border-brand/40 hover:shadow-sm"
              )}
            >
              <div className={cn(
                "flex items-center justify-center size-12 rounded-full",
                activeFlow === 'platform' ? "bg-brand/10" : "bg-surface-2"
              )}>
                <Monitor className={cn("size-6", activeFlow === 'platform' ? "text-brand" : "text-text-secondary")} />
              </div>
              <span className={cn(
                "text-lg font-semibold",
                activeFlow === 'platform' ? "text-brand" : "text-foreground"
              )}>
                For Platform Screen
              </span>
              <span className="text-xs text-text-tertiary">Run screening against existing platform screens</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFlow('independent')}
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 px-6 py-8 bg-surface-0 cursor-pointer outline-none hover:shadow-sm",
                activeFlow === 'independent'
                  ? "border-brand shadow-md"
                  : "border-border hover:border-brand/40 hover:shadow-sm"
              )}
            >
              <div className={cn(
                "flex items-center justify-center size-12 rounded-full",
                activeFlow === 'independent' ? "bg-brand/10" : "bg-surface-2"
              )}>
                <Briefcase className={cn("size-6", activeFlow === 'independent' ? "text-brand" : "text-text-secondary")} />
              </div>
              <span className={cn(
                "text-lg font-semibold",
                activeFlow === 'independent' ? "text-brand" : "text-foreground"
              )}>
                Independent Use Case
              </span>
              <span className="text-xs text-text-tertiary">Custom prompts with your own dataset</span>
            </button>
          </div>
          )}

          {/* Flow content */}
          {activeFlow === 'platform' && (
            <PlatformScreenFlow
              key={navigationKey}
              rationaleEnabled={rationaleEnabled}
              initialPrompts={navState?.prompts ?? null}
              initialScreeningId={navState?.screeningId ?? null}
              sourceListName={navState?.listName ?? null}
              autoReview={Boolean(navState?.prompts)}
              onActivityStart={handleFlowActivityStart}
            />
          )}
          {activeFlow === 'independent' && <IndependentUseCaseFlow onActivityStart={handleFlowActivityStart} />}
        </div>
      </div>
    </div>
  );
}
