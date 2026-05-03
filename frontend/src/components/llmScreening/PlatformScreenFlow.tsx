import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { BatchSizeControl } from './BatchSizeControl';
import { Loader2, Check, Expand, RotateCcw, Trash2, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import { addCompaniesToList, createList, generateLLMScreeningPrompts, listScreenings } from '../../api/endpoints';
import type { ScreeningSummary } from '../../api/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

/* ─── colour tokens for each bucket (safe static classes) ─── */
const BUCKET_STYLES = {
  Yes:       { border: 'border-green-500',  hoverBorder: 'hover:border-green-400', text: 'text-green-500',  bg: 'bg-green-500/5',  bgBadge: 'bg-green-500/10' },
  No:        { border: 'border-red-500',    hoverBorder: 'hover:border-red-400',   text: 'text-red-500',    bg: 'bg-red-500/5',    bgBadge: 'bg-red-500/10'   },
  Maybe:     { border: 'border-yellow-500', hoverBorder: 'hover:border-yellow-400',text: 'text-yellow-600', bg: 'bg-yellow-500/5', bgBadge: 'bg-yellow-500/10'},
  Rationale: { border: 'border-blue-500',   hoverBorder: 'hover:border-blue-400',  text: 'text-blue-500',   bg: 'bg-blue-500/5',   bgBadge: 'bg-blue-500/10'  },
} as const;

const RESULT_BUCKET_STYLES = {
  Yes: {
    border: 'border-green-700',
    hoverBorder: 'hover:border-green-800',
    text: 'text-green-700',
    bg: 'bg-green-50',
    bgBadge: 'bg-green-50',
    active: 'ring-2 ring-green-700/35 border-green-800 shadow-sm',
  },
  No: {
    border: 'border-red-700',
    hoverBorder: 'hover:border-red-800',
    text: 'text-red-700',
    bg: 'bg-red-50',
    bgBadge: 'bg-red-50',
    active: 'ring-2 ring-red-700/35 border-red-800 shadow-sm',
  },
  Maybe: {
    border: 'border-amber-900',
    hoverBorder: 'hover:border-amber-950',
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    bgBadge: 'bg-amber-50',
    active: 'ring-2 ring-amber-900/35 border-amber-950 shadow-sm',
  },
  Error: {
    border: 'border-slate-700',
    hoverBorder: 'hover:border-slate-900',
    text: 'text-slate-800',
    bg: 'bg-slate-100',
    bgBadge: 'bg-slate-100',
    active: 'ring-2 ring-slate-700/35 border-slate-900 shadow-sm',
  },
} as const;

type PromptKey = keyof typeof BUCKET_STYLES;

const EMPTY_PROMPTS: Record<PromptKey, string> = {
  Yes: '',
  No: '',
  Maybe: '',
  Rationale: '',
};

const MODELS = [
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', state: 'Stable' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', state: 'Stable' },
  { id: 'gpt-4o', name: 'GPT-4o', state: 'Preview' },
];

interface PlatformScreenFlowProps {
  rationaleEnabled: boolean;
  initialPrompts?: Partial<Record<PromptKey, string>> | null;
  initialScreeningId?: string | null;
  sourceListName?: string | null;
  autoReview?: boolean;
  onActivityStart?: () => void;
}

type FlowState = 'select' | 'loading_prompts' | 'review_prompts' | 'running' | 'results';
type DecisionBucket = 'Yes' | 'No' | 'Maybe' | 'Error';
type ResultFilterBucket = DecisionBucket | 'All';
interface StubResultRow {
  id: string;
  company: string;
  website: string;
  decision: DecisionBucket;
  rationale: string;
}

const STUB_RESULTS: StubResultRow[] = [
  { id: '1', company: 'Atlas Automation', website: 'https://atlas.example.com', decision: 'Yes', rationale: 'Strong fit against the final criteria with clear evidence of target-market alignment and relevant customer proof.' },
  { id: '2', company: 'Boreal Systems', website: 'https://boreal.example.com', decision: 'Maybe', rationale: 'Partial fit, but revenue and segment evidence are missing from the available source data.' },
  { id: '3', company: 'Cinder Labs', website: 'https://cinder.example.com', decision: 'No', rationale: 'The company appears outside the required sector and does not show the mandatory service line.' },
  { id: '4', company: 'DeltaWorks', website: 'https://deltaworks.example.com', decision: 'Yes', rationale: 'Meets the required business model and geography criteria with explicit website evidence.' },
  { id: '5', company: 'Evergreen Advisory', website: 'https://evergreen.example.com', decision: 'No', rationale: 'Primarily advisory-only and lacks direct product/service evidence required by the criteria.' },
  { id: '6', company: 'FluxGrid', website: 'https://fluxgrid.example.com', decision: 'Maybe', rationale: 'Promising description, but the LLM would need more detail to confirm compliance with all blockers.' },
  { id: '7', company: 'Greyline Robotics', website: 'https://greyline.example.com', decision: 'Error', rationale: 'ERROR: LLM response timed out before the decision could be parsed.' },
  { id: '8', company: 'Harbor BioSystems', website: 'https://harbor.example.com', decision: 'Error', rationale: 'ERROR: Required output JSON was malformed and needs a rerun.' },
];

export function PlatformScreenFlow({
  rationaleEnabled,
  initialPrompts,
  initialScreeningId = null,
  sourceListName = null,
  autoReview = false,
  onActivityStart,
}: PlatformScreenFlowProps) {
  const [state, setState] = useState<FlowState>(autoReview ? 'review_prompts' : 'select');
  const [selectedScreen, setSelectedScreen] = useState<string>(initialScreeningId ?? '');
  const [screeningOptions, setScreeningOptions] = useState<ScreeningSummary[]>([]);
  const [loadingScreens, setLoadingScreens] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  /* prompts */
  const [prompts, setPrompts] = useState<Record<PromptKey, string>>({
    ...EMPTY_PROMPTS,
    ...initialPrompts,
  });
  const [editingPrompt, setEditingPrompt] = useState<PromptKey | null>(null);
  const [batchSize, setBatchSize] = useState(20);
  const [model, setModel] = useState('');

  /* run */
  const [progress, setProgress] = useState(0);
  const [runStatus, setRunStatus] = useState('Starting LLM Suite...');
  const [counts, setCounts] = useState({ Yes: 0, No: 0, Maybe: 0, Error: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [results, setResults] = useState<StubResultRow[]>(STUB_RESULTS);
  const [activeBucket, setActiveBucket] = useState<ResultFilterBucket>('All');
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<StubResultRow[][]>([]);
  const [rerunningErrors, setRerunningErrors] = useState(false);
  const [errorRerunAttempt, setErrorRerunAttempt] = useState(0);
  const resultGridApiRef = useRef<GridApi<StubResultRow> | null>(null);
  const syncingSelectionRef = useRef(false);

  const selectedScreenLabel = useMemo(() => {
    const screen = screeningOptions.find((item) => item.id === selectedScreen);
    return screen?.screen_name || screen?.original_filename || selectedScreen || 'selected screen';
  }, [screeningOptions, selectedScreen]);

  useEffect(() => {
    let cancelled = false;
    setLoadingScreens(true);
    listScreenings()
      .then((items) => {
        if (!cancelled) setScreeningOptions(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setScreeningOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingScreens(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── handlers ─── */
  const handleProceed = async () => {
    if (!selectedScreen) return;
    setState('loading_prompts');
    setPromptError(null);
    const toastId = toast.loading(`Generating LLM screening prompts for ${selectedScreenLabel}…`);
    try {
      const response = await generateLLMScreeningPrompts({
        screening_id: selectedScreen,
        rationale_enabled: rationaleEnabled,
      });
      setPrompts((current) => ({ ...current, ...response.prompts }));
      setState('review_prompts');
      toast.success('Generated Yes/No/Maybe prompts. Review and edit prompts before starting.', { id: toastId });
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message || 'LLM prompt generation failed or timed out';
      setPromptError(message);
      setState('select');
      toast.error(`${message}. Use Try again to regenerate the prompts.`, { id: toastId });
    }
  };

  const handleStartRun = () => {
    onActivityStart?.();
    setState('running');
    setProgress(0);
    setRunStatus('Authenticating...');
    setIsPaused(false);
    setCounts({ Yes: 0, No: 0, Maybe: 0, Error: 0 });
    setSelectedResultIds(new Set());
    setUndoStack([]);
    setRerunningErrors(false);
    setErrorRerunAttempt(0);
    setTimeout(() => setRunStatus('Processing...'), 1000);
  };

  const visibleResults = useMemo(
    () => activeBucket === 'All' ? results : results.filter((row) => row.decision === activeBucket),
    [activeBucket, results],
  );

  const resultCounts = useMemo(() => ({
    Yes: results.filter((row) => row.decision === 'Yes').length,
    No: results.filter((row) => row.decision === 'No').length,
    Maybe: results.filter((row) => row.decision === 'Maybe').length,
    Error: results.filter((row) => row.decision === 'Error').length,
  }), [results]);

  const finalListName = `${selectedScreenLabel.replace(/\s+/g, '_') || 'Screen'}_ListafterLLM`;

  const syncVisibleSelection = useCallback((api: GridApi<StubResultRow> | null = resultGridApiRef.current) => {
    if (!api) return;
    syncingSelectionRef.current = true;
    try {
      api.forEachNode((node) => {
        const id = node.data?.id;
        node.setSelected(Boolean(id && selectedResultIds.has(id)));
      });
    } finally {
      syncingSelectionRef.current = false;
    }
  }, [selectedResultIds]);

  useEffect(() => {
    syncVisibleSelection();
  }, [syncVisibleSelection, visibleResults]);

  const handleResultGridReady = useCallback((event: GridReadyEvent<StubResultRow>) => {
    resultGridApiRef.current = event.api;
    syncVisibleSelection(event.api);
  }, [syncVisibleSelection]);

  const handleResultSelectionChanged = useCallback((event: SelectionChangedEvent<StubResultRow>) => {
    if (syncingSelectionRef.current) return;
    const source = String((event as any).source || '');
    if (source === 'rowDataChanged' || source === 'rowDataUpdated') return;
    setSelectedResultIds((current) => {
      const next = new Set(current);
      event.api.forEachNode((node) => {
        const id = node.data?.id;
        if (id) next.delete(id);
      });
      event.api.getSelectedRows().forEach((row) => {
        if (row.id) next.add(row.id);
      });
      return next;
    });
  }, []);

  const handleDeselectAll = () => {
    setSelectedResultIds(new Set());
    resultGridApiRef.current?.deselectAll();
  };

  const handleDeleteSelected = () => {
    if (selectedResultIds.size === 0) return;
    const idsToDelete = new Set(selectedResultIds);
    const rowsToDelete = results.filter((row) => idsToDelete.has(row.id));
    if (rowsToDelete.length === 0) return;
    setUndoStack((current) => [results, ...current].slice(0, 5));
    setResults((current) => current.filter((row) => !idsToDelete.has(row.id)));
    setSelectedResultIds(new Set());
    resultGridApiRef.current?.deselectAll();
    toast.success(`Deleted ${rowsToDelete.length} selected result${rowsToDelete.length === 1 ? '' : 's'}. Use Undo to restore.`);
  };

  const handleUndoDelete = () => {
    const previous = undoStack[0];
    if (!previous) return;
    setResults(previous);
    setUndoStack((current) => current.slice(1));
    toast.success('Restored the last deleted result set.');
  };

  const handleRerunErrors = () => {
    const errorRows = results.filter((row) => row.decision === 'Error');
    if (errorRows.length === 0 || rerunningErrors) return;
    const nextAttempt = errorRerunAttempt + 1;
    setRerunningErrors(true);
    const toastId = toast.loading(`Re-running ${errorRows.length} ERROR row${errorRows.length === 1 ? '' : 's'}…`);
    setTimeout(() => {
      let errorIndex = 0;
      let remainingErrors = 0;
      const nextResults = results.map((row) => {
        if (row.decision !== 'Error') return row;
        errorIndex += 1;
        const shouldResolve = nextAttempt > 1 || errorIndex % 2 === 1;
        if (shouldResolve) {
          return {
            ...row,
            decision: 'Maybe' as const,
            rationale: `Recovered on ERROR rerun. ${row.rationale.replace(/^ERROR:\s*/i, '')}`,
          };
        }
        remainingErrors += 1;
        return {
          ...row,
          rationale: `ERROR persists after rerun ${nextAttempt}. ${row.rationale.replace(/^ERROR(?: persists after rerun \d+\.)?\s*/i, '')}`,
        };
      });
      setResults(nextResults);
      setErrorRerunAttempt(nextAttempt);
      setRerunningErrors(false);
      if (remainingErrors > 0) {
        toast.warning(`${remainingErrors} ERROR row${remainingErrors === 1 ? '' : 's'} still need another rerun.`, { id: toastId });
      } else {
        toast.success('All ERROR rows were resolved.', { id: toastId });
        if (activeBucket === 'Error') setActiveBucket('All');
      }
    }, 1200);
  };

  const handleAddToFinalList = async () => {
    const yesRows = results.filter((row) => row.decision === 'Yes');
    if (yesRows.length === 0) {
      toast.info('No YES rows are available to add to the final list.');
      return;
    }
    try {
      await createList(finalListName, selectedScreen || null, selectedScreenLabel || null).catch((error: any) => {
        const detail = error?.response?.data?.detail || '';
        if (!String(detail).includes('already exists')) throw error;
      });
      await addCompaniesToList(finalListName, yesRows.map((row) => ({
        company: row.company,
        primary_key_value: row.id,
        crescendo_id: row.id,
        source_keywords: ['LLM Screening YES'],
      })));
      toast.success(`Created/updated final list "${finalListName}" with ${yesRows.length} YES rows.`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to add rows to the final list.');
    }
  };

  const resultColumnDefs = useMemo<ColDef<StubResultRow>[]>(() => [
    {
      colId: '__selection__',
      headerName: '',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      headerCheckboxSelectionFilteredOnly: true,
      width: 44,
      pinned: 'left',
      sortable: false,
      filter: false,
      resizable: false,
      lockPosition: true,
    },
    { field: 'company', headerName: 'Company', flex: 1.4, minWidth: 180, filter: 'agTextColumnFilter' },
    {
      field: 'decision',
      headerName: 'Decision',
      width: 130,
      cellClass: (params) => cn(
        'font-bold',
        params.value === 'Yes' && 'text-green-600',
        params.value === 'No' && 'text-red-600',
        params.value === 'Maybe' && 'text-amber-800',
        params.value === 'Error' && 'text-slate-800',
      ),
    },
    {
      field: 'rationale',
      headerName: 'Rationale',
      flex: 2,
      minWidth: 260,
      cellRenderer: (params: any) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<span className="block max-w-full cursor-help truncate text-text-secondary" />}>
              {params.value}
            </TooltipTrigger>
            <TooltipContent className="max-w-md leading-5">{params.value}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      field: 'website',
      headerName: 'Website',
      flex: 1,
      minWidth: 180,
      cellRenderer: (params: any) => <a className="text-brand underline" href={params.value} target="_blank" rel="noreferrer">{params.value}</a>,
    },
  ], []);

  /* simulated progress */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === 'running' && !isPaused && progress < 100 && runStatus === 'Processing...') {
      interval = setInterval(() => {
        setProgress(p => Math.min(100, p + Math.floor(Math.random() * 5) + 1));
        const r = Math.random();
        setCounts(c => {
          if (r < 0.3) return { ...c, Yes: c.Yes + 1 };
          if (r < 0.6) return { ...c, No: c.No + 1 };
          if (r < 0.9) return { ...c, Maybe: c.Maybe + 1 };
          return { ...c, Error: c.Error + 1 };
        });
      }, 500);
    } else if (progress >= 100 && state === 'running') {
      setCounts({ Yes: resultCounts.Yes, No: resultCounts.No, Maybe: resultCounts.Maybe, Error: resultCounts.Error });
      setRunStatus(resultCounts.Error > 0 ? 'Done with ERRORs' : 'Done');
      setState('results');
    }
    return () => clearInterval(interval);
  }, [state, isPaused, progress, runStatus, resultCounts]);

  /* ─── prompt card ─── */
  const PromptCard = ({ bucket }: { bucket: keyof typeof BUCKET_STYLES }) => {
    const s = BUCKET_STYLES[bucket];
    const isEditing = editingPrompt === bucket;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (isEditing && textareaRef.current) textareaRef.current.focus();
    }, [isEditing]);

    return (
      <div
        className={cn(
          "relative flex flex-col gap-2 rounded-xl border-2 p-5 min-h-[220px] bg-surface-0 cursor-text group hover:shadow-md",
          s.hoverBorder,
          isEditing ? s.border : "border-border"
        )}
        onDoubleClick={() => setEditingPrompt(bucket)}
      >
        <div className="flex justify-between items-start">
          <h3 className={cn(
            "text-base font-bold tracking-wide uppercase",
            isEditing ? s.text : "text-foreground",
          )}
            style={{ '--bucket-color': s.text } as React.CSSProperties}
          >
            <span className={cn("inline-block", `group-[]:${s.text}`)}>
              {bucket}
            </span>
          </h3>
          <Dialog>
            <DialogTrigger render={
              <button 
                className="cursor-pointer p-1.5 rounded-md hover:bg-surface-1 text-text-secondary z-10"
                title="Expand Editor"
                onClick={(e) => e.stopPropagation()}
              >
                <Expand className="size-4" />
              </button>
            } />
            <DialogContent className="h-[80vh] w-[min(70vw,1280px)] max-w-[calc(100vw-2rem)] p-6 sm:max-w-[min(70vw,1280px)] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Edit {bucket} Prompt</DialogTitle>
              </DialogHeader>
              <div className="flex-1 mt-4 relative">
                <Textarea
                  className="absolute inset-0 resize-none bg-surface-0 border shadow-inner text-base p-6 h-full"
                  value={prompts[bucket]}
                  onChange={e => setPrompts(p => ({ ...p, [bucket]: e.target.value }))}
                />
              </div>
              <DialogFooter className="mt-4">
                <DialogClose render={<Button className="bg-brand hover:bg-brand-hover text-brand-fg">Done</Button>} />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isEditing ? (
          <Textarea
            ref={textareaRef}
            className="flex-1 w-full bg-surface-1 rounded-lg p-3 text-sm resize-none"
            value={prompts[bucket]}
            onChange={e => setPrompts(p => ({ ...p, [bucket]: e.target.value }))}
            onBlur={() => setEditingPrompt(null)}
          />
        ) : (
          <p className="text-sm text-text-secondary flex-1 whitespace-pre-wrap leading-relaxed relative line-clamp-[7]">
            {prompts[bucket]}
          </p>
        )}
        {!isEditing && (
          <span className="absolute bottom-3 right-3 text-[10px] text-text-tertiary select-none">
            dbl-click to edit
          </span>
        )}
      </div>
    );
  };

  /* ─── native progress bar ─── */
  const ProgressBar = ({ value, className }: { value: number; className?: string }) => (
    <div className={cn("w-full h-3 bg-border rounded-full overflow-hidden", className)}>
      <div
        className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );

  /* ─── RENDER ─── */
  return (
    <div className="space-y-6">

      {/* ── SELECT ── */}
      {state === 'select' && (
        <div className="bg-surface-0 border rounded-xl p-6 shadow-sm space-y-5 max-w-lg">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Select Screen</h3>
          <Select value={selectedScreen} onValueChange={(val) => setSelectedScreen(val || '')}>
            <SelectTrigger className="w-full h-auto py-2 bg-surface-0 items-center">
              <SelectValue placeholder={loadingScreens ? 'Loading screens…' : 'Choose a platform screen…'} />
            </SelectTrigger>
            <SelectContent>
              {screeningOptions.map(screen => (
                <SelectItem key={screen.id} value={screen.id}>
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium text-foreground">{screen.screen_name || screen.original_filename || screen.id}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{screen.status} • {screen.updated_at || 'not saved'}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {promptError && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <div className="font-semibold">Prompt generation failed</div>
              <div>{promptError}</div>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleProceed} disabled={!selectedScreen}>
                <RotateCcw className="mr-2 size-4" /> Try again
              </Button>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => { void handleProceed(); }}
              disabled={!selectedScreen || loadingScreens}
              className="bg-brand text-brand-fg hover:bg-brand-hover px-6"
            >
              Proceed
            </Button>
          </div>
        </div>
      )}

      {/* ── LOADING PROMPTS ── */}
      {state === 'loading_prompts' && (
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm text-text-secondary">Generating Yes/No/Maybe prompts from final criteria…</p>
          <div className="w-full max-w-2xl rounded-xl border bg-surface-0 p-5 text-sm text-text-secondary shadow-sm">
            <div className="font-semibold text-foreground">Preparing prompt review workspace</div>
            <div className="mt-1">This is using the saved screen criteria and may take a moment if the LLM service is slow.</div>
          </div>
        </div>
      )}

      {/* ── REVIEW PROMPTS ── */}
      {state === 'review_prompts' && (
        <div className="space-y-5">
          {/* header row */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">Review the Prompts</h2>
              {sourceListName && (
                <p className="text-xs text-text-secondary mt-1">Source list: {sourceListName}</p>
              )}
            </div>
            <div className="flex items-end gap-3">
              {/* Model selector — using Select */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Model</span>
                <Select value={model} onValueChange={(val) => setModel(val || '')}>
                  <SelectTrigger className="w-[190px] h-10 bg-surface-0 shadow-sm border rounded-lg px-4 font-medium hover:bg-surface-1 items-center">
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-foreground">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{m.state}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Batch size */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Batch</span>
                <div className="flex h-10 items-center gap-3 bg-surface-0 border rounded-lg px-4 shadow-sm">
                  <BatchSizeControl value={batchSize} onChange={setBatchSize} min={1} max={50} className="w-[200px]" />
                </div>
              </div>
            </div>
          </div>

          {/* cards */}
          <div className="bg-surface-0 rounded-xl p-6 border shadow-sm">
            {!rationaleEnabled ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <PromptCard bucket="Yes" />
                  <PromptCard bucket="No" />
                </div>
                <div className="max-w-2xl mx-auto">
                  <PromptCard bucket="Maybe" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5">
                <PromptCard bucket="Yes" />
                <PromptCard bucket="No" />
                <PromptCard bucket="Maybe" />
                <PromptCard bucket="Rationale" />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="lg"
              className="bg-brand text-brand-fg hover:bg-brand-hover px-8 text-base"
              onClick={handleStartRun}
            >
              Start
            </Button>
          </div>
        </div>
      )}

      {/* ── RUNNING ── */}
      {state === 'running' && (
        <div className="bg-surface-0 border rounded-xl p-8 shadow-sm space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold mb-1">Screening Process</h2>
              <p className="text-sm text-text-secondary">{runStatus}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={isPaused ? 'default' : 'destructive'}
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? 'Restore' : 'Stop'}
              </Button>
              {isPaused && (
                <Button variant="outline" size="sm" onClick={handleStartRun}>Start Afresh</Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-text-secondary">
              <span>Progress</span>
              <span>{Math.min(100, progress)}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          <div className={cn("grid gap-3 pt-2", counts.Error > 0 ? "grid-cols-4" : "grid-cols-3")}>
            {(['Yes', 'No', 'Maybe'] as const).map(k => {
              const s = RESULT_BUCKET_STYLES[k];
              return (
                <div key={k} className={cn("flex flex-col items-center py-3 rounded-lg border", s.border, s.bg)}>
                  <span className={cn("font-bold text-2xl tabular-nums", s.text)}>{resultCounts[k]}</span>
                  <span className="text-xs font-medium text-text-secondary">{k}</span>
                </div>
              );
            })}
            {counts.Error > 0 && (
              <div className={cn("flex flex-col items-center py-3 rounded-lg border", RESULT_BUCKET_STYLES.Error.border, RESULT_BUCKET_STYLES.Error.bg)}>
                <span className={cn("font-bold text-2xl tabular-nums", RESULT_BUCKET_STYLES.Error.text)}>{counts.Error}</span>
                <span className="text-xs font-medium text-text-secondary">Error</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {state === 'results' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h2 className="text-xl font-bold">Screening Complete</h2>
            <div className="flex flex-wrap justify-end gap-2">
              {resultCounts.Error > 0 && (
                <Button variant="outline" size="sm" onClick={handleRerunErrors} disabled={rerunningErrors} className="text-slate-800 hover:bg-slate-100">
                  {rerunningErrors ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RotateCcw className="size-4 mr-1.5" />} Re-run ERRORs
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleUndoDelete} disabled={undoStack.length === 0} className="disabled:opacity-40">
                <Undo2 className="size-4 mr-1.5" /> Undo
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll} disabled={selectedResultIds.size === 0} className="disabled:opacity-40">
                <XCircle className="size-4 mr-1.5" /> Deselect all
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={selectedResultIds.size === 0}>
                <Trash2 className="size-4 mr-1.5" /> Delete selected
              </Button>
              <Button size="sm" className="bg-brand text-brand-fg hover:bg-brand-hover" onClick={handleAddToFinalList}>
                <Check className="size-4 mr-1.5" /> Add to Final List
              </Button>
            </div>
          </div>

          {/* Bucket summary badges */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveBucket('All')}
              className={cn("px-4 py-1.5 rounded-md text-sm font-semibold border border-slate-400 bg-surface-0 hover:border-slate-600", activeBucket === 'All' && 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20')}
            >
              All: {results.length}
            </button>
            {(['Yes', 'No', 'Maybe'] as const).map(k => {
              const s = RESULT_BUCKET_STYLES[k];
              return (
                <button key={k} type="button" onClick={() => setActiveBucket(k)} className={cn("px-4 py-1.5 rounded-md text-sm font-semibold border", s.bgBadge, s.text, s.border, s.hoverBorder, activeBucket === k && s.active)}>
                  {k}: {resultCounts[k]}
                </button>
              );
            })}
            {resultCounts.Error > 0 && (() => {
              const s = RESULT_BUCKET_STYLES.Error;
              return (
                <button type="button" onClick={() => setActiveBucket('Error')} className={cn("px-4 py-1.5 rounded-md text-sm font-semibold border", s.bgBadge, s.text, s.border, s.hoverBorder, activeBucket === 'Error' && s.active)}>
                  Error: {resultCounts.Error}
                </button>
              );
            })()}
            {selectedResultIds.size > 0 && (
              <span className="text-sm font-semibold text-brand">{selectedResultIds.size} selected</span>
            )}
          </div>

          <div className="bg-surface-0 border rounded-xl overflow-hidden shadow-sm min-h-[62vh]">
            <div className="ag-theme-quartz ag-premium-headers h-[62vh] w-full">
              <AgGridReact<StubResultRow>
                theme="legacy"
                rowData={visibleResults}
                columnDefs={resultColumnDefs}
                onGridReady={handleResultGridReady}
                onSelectionChanged={handleResultSelectionChanged}
                onRowDataUpdated={() => syncVisibleSelection()}
                rowSelection="multiple"
                suppressRowClickSelection
                rowHeight={40}
                headerHeight={42}
                animateRows={false}
                getRowId={(params) => params.data.id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
