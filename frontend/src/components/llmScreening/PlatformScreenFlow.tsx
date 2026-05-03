import { useState, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { BatchSizeControl } from './BatchSizeControl';
import { Loader2, Check, Expand } from 'lucide-react';

/* ─── colour tokens for each bucket (safe static classes) ─── */
const BUCKET_STYLES = {
  Yes:       { border: 'border-green-500',  hoverBorder: 'hover:border-green-400', text: 'text-green-500',  bg: 'bg-green-500/5',  bgBadge: 'bg-green-500/10' },
  No:        { border: 'border-red-500',    hoverBorder: 'hover:border-red-400',   text: 'text-red-500',    bg: 'bg-red-500/5',    bgBadge: 'bg-red-500/10'   },
  Maybe:     { border: 'border-yellow-500', hoverBorder: 'hover:border-yellow-400',text: 'text-yellow-600', bg: 'bg-yellow-500/5', bgBadge: 'bg-yellow-500/10'},
  Rationale: { border: 'border-blue-500',   hoverBorder: 'hover:border-blue-400',  text: 'text-blue-500',   bg: 'bg-blue-500/5',   bgBadge: 'bg-blue-500/10'  },
} as const;

const MODELS = [
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', state: 'Stable' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', state: 'Stable' },
  { id: 'gpt-4o', name: 'GPT-4o', state: 'Preview' },
];

interface PlatformScreenFlowProps {
  rationaleEnabled: boolean;
}

type FlowState = 'select' | 'loading_prompts' | 'review_prompts' | 'running' | 'results';

export function PlatformScreenFlow({ rationaleEnabled }: PlatformScreenFlowProps) {
  const [state, setState] = useState<FlowState>('select');
  const [selectedScreen, setSelectedScreen] = useState<string>('');

  /* prompts */
  const [prompts, setPrompts] = useState({
    Yes: "Example prompt for YES bucket. Double click to edit.",
    No: "Example prompt for NO bucket. Double click to edit.",
    Maybe: "Example prompt for MAYBE bucket. Double click to edit.",
    Rationale: "Example prompt for Rationale. Double click to edit."
  });
  const [editingPrompt, setEditingPrompt] = useState<keyof typeof prompts | null>(null);
  const [batchSize, setBatchSize] = useState(20);
  const [model, setModel] = useState('');

  /* run */
  const [progress, setProgress] = useState(0);
  const [runStatus, setRunStatus] = useState('Starting LLM Suite...');
  const [counts, setCounts] = useState({ Yes: 0, No: 0, Maybe: 0, Error: 0 });
  const [isPaused, setIsPaused] = useState(false);

  const mockScreens = [
    { id: '1', name: 'SaaS Screening', date: '2026-05-01', state: 'ongoing' },
    { id: '2', name: 'Fintech Series A', date: '2026-04-20', state: 'completed' },
  ];

  /* ─── handlers ─── */
  const handleProceed = () => {
    setState('loading_prompts');
    setTimeout(() => setState('review_prompts'), 1400);
  };

  const handleStartRun = () => {
    setState('running');
    setProgress(0);
    setRunStatus('Authenticating...');
    setIsPaused(false);
    setCounts({ Yes: 0, No: 0, Maybe: 0, Error: 0 });
    setTimeout(() => setRunStatus('Processing...'), 1000);
  };

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
      if (counts.Error > 0 && runStatus !== 'Re-running for ERRORs...') {
        setRunStatus('Re-running for ERRORs...');
        setTimeout(() => {
          setCounts(c => ({ ...c, Maybe: c.Maybe + c.Error, Error: 0 }));
          setRunStatus('Done');
          setState('results');
        }, 2000);
      } else if (counts.Error === 0) {
        setState('results');
      }
    }
    return () => clearInterval(interval);
  }, [state, isPaused, progress, runStatus, counts.Error]);

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
          "relative flex flex-col gap-2 rounded-xl border-2 p-5 min-h-[220px] bg-surface-0 cursor-default transition-all duration-200 group",
          "hover:shadow-md hover:scale-[1.015]",
          s.hoverBorder,
          isEditing ? s.border : "border-border"
        )}
        onDoubleClick={() => setEditingPrompt(bucket)}
      >
        <div className="flex justify-between items-start">
          <h3 className={cn(
            "text-base font-bold tracking-wide uppercase transition-colors duration-200",
            isEditing ? s.text : "text-foreground",
          )}
            style={{ '--bucket-color': s.text } as React.CSSProperties}
          >
            <span className={cn("inline-block transition-colors duration-200", `group-[]:${s.text}`)}>
              {bucket}
            </span>
          </h3>
          <Dialog>
            <DialogTrigger render={
              <button 
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-1 text-text-secondary z-10"
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
              <SelectValue placeholder="Choose a platform screen…" />
            </SelectTrigger>
            <SelectContent>
              {mockScreens.map(screen => (
                <SelectItem key={screen.id} value={screen.id}>
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium text-foreground">{screen.name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{screen.state} • {screen.date}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleProceed}
              disabled={!selectedScreen}
              className="bg-brand text-brand-fg hover:bg-brand-hover px-6"
            >
              Proceed
            </Button>
          </div>
        </div>
      )}

      {/* ── LOADING SKELETON ── */}
      {state === 'loading_prompts' && (
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm text-text-secondary animate-pulse">Generating skeleton…</p>
          <div className="w-full max-w-4xl grid grid-cols-2 gap-4 mt-6">
            {[...Array(rationaleEnabled ? 4 : 3)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-36 rounded-xl bg-border/40 animate-pulse",
                  !rationaleEnabled && i === 2 && "col-span-2 mx-16"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── REVIEW PROMPTS ── */}
      {state === 'review_prompts' && (
        <div className="space-y-5">
          {/* header row */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xl font-bold text-foreground">Review the Prompts</h2>
            <div className="flex items-center gap-3">
              {/* Model selector — using Select */}
              <Select value={model} onValueChange={(val) => setModel(val || '')}>
                <SelectTrigger className="w-[170px] h-auto py-2 bg-surface-0 shadow-sm border rounded-lg px-4 font-medium hover:bg-surface-1 transition-colors items-center">
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
              {/* Batch size */}
              <div className="flex items-center gap-3 bg-surface-0 border rounded-lg px-4 py-2.5 shadow-sm">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Batch</span>
                <BatchSizeControl value={batchSize} onChange={setBatchSize} min={1} max={50} className="w-[200px]" />
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
              <p className="text-sm text-text-secondary animate-pulse">{runStatus}</p>
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
              const s = BUCKET_STYLES[k];
              return (
                <div key={k} className={cn("flex flex-col items-center py-3 rounded-lg border", s.bg)}>
                  <span className={cn("font-bold text-2xl tabular-nums", s.text)}>{counts[k]}</span>
                  <span className="text-xs font-medium text-text-secondary">{k}</span>
                </div>
              );
            })}
            {counts.Error > 0 && (
              <div className="flex flex-col items-center py-3 rounded-lg border bg-black/5">
                <span className="font-bold text-2xl tabular-nums text-black">{counts.Error}</span>
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Undo</Button>
              <Button variant="destructive" size="sm">Remove All</Button>
              <Button size="sm" className="bg-brand text-brand-fg hover:bg-brand-hover">
                <Check className="size-4 mr-1.5" /> Add to Final List
              </Button>
            </div>
          </div>

          {/* Bucket summary badges */}
          <div className="flex gap-3">
            {(['Yes', 'No', 'Maybe'] as const).map(k => {
              const s = BUCKET_STYLES[k];
              return (
                <span key={k} className={cn("px-4 py-1.5 rounded-md text-sm font-semibold", s.bgBadge, s.text)}>
                  {k}: {counts[k]}
                </span>
              );
            })}
          </div>

          <div className="bg-surface-0 border rounded-xl overflow-hidden shadow-sm min-h-[360px] flex items-center justify-center">
            <div className="text-center space-y-3 p-8">
              <p className="text-text-secondary font-medium">Results Grid (AG Grid Stub)</p>
              <p className="text-sm text-text-tertiary max-w-md mx-auto leading-relaxed">
                Company, Rationale (with hover tooltip), and Website links will appear here.
                Checkboxes available for list management.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
