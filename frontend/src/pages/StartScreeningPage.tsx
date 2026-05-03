import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FolderOpen,
  PlusCircle,
  Search,
  ArrowUpDown,
  Trash2,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import {
  useScreenStore,
  PIPELINE_STEP_ROUTES,
  type ScreenRecord,
} from '../stores/screenStore';
import { listScreenings } from '../api/endpoints';
import { toast } from 'sonner';

/* ─── Types ─── */
type SortKey = 'screenName' | 'submitterName' | 'incomingDate' | 'deadlineDate';
type SortDir = 'asc' | 'desc';

/* ─── Fuzzy‑match helper ─── */
function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return true;
  // simple contains + char‑sequence check
  if (lowerText.includes(lowerQuery)) return true;
  let qi = 0;
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

/* ─── Date formatting ─── */
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Component ─── */
export function StartScreeningPage() {
  const navigate = useNavigate();
  const { screens, setActiveScreen, removeScreen, syncScreenings } = useScreenStore();

  /* Sub‑view state */
  const [view, setView] = useState<'choose' | 'existing'>('choose');

  /* Table controls */
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('incomingDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [loadingScreens, setLoadingScreens] = useState(false);

  /* Dialogs */
  const [restoreTarget, setRestoreTarget] = useState<ScreenRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScreenRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingScreens(true);
    listScreenings()
      .then((data) => {
        if (cancelled) return;
        syncScreenings(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load screens from the database.');
      })
      .finally(() => {
        if (!cancelled) setLoadingScreens(false);
      });
    return () => {
      cancelled = true;
    };
  }, [syncScreenings]);

  /* ── Derived filtered & sorted list ── */
  const filteredScreens = useMemo(() => {
    let list = screens;
    if (searchQuery.trim()) {
      list = list.filter(
        (s) =>
          fuzzyMatch(s.screenName, searchQuery) ||
          fuzzyMatch(s.submitterName, searchQuery) ||
          fuzzyMatch(s.investmentCriteria, searchQuery)
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'incomingDate' || sortKey === 'deadlineDate') {
        cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [screens, searchQuery, sortKey, sortDir]);

  /* ── Sort toggle helper ── */
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  /* ── Confirm restore ── */
  const handleConfirmRestore = () => {
    if (!restoreTarget) return;
    setActiveScreen(restoreTarget);
    const routeBase = PIPELINE_STEP_ROUTES[restoreTarget.pipelineStep] ?? '/search';
    const route = restoreTarget.source === 'screenings-db' && routeBase === '/screenings/new'
      ? `/screenings/${restoreTarget.screeningId ?? restoreTarget.id}`
      : restoreTarget.source === 'screenings-db' && routeBase === '/criteria-analysis'
        ? `/criteria-analysis/${restoreTarget.screeningId ?? restoreTarget.id}`
        : routeBase;
    setRestoreTarget(null);
    navigate(route);
  };

  /* ── Confirm delete ── */
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    removeScreen(deleteTarget.id);
    setDeleteTarget(null);
  };

  /* Sort icon helper */
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="size-3.5 text-text-tertiary" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="size-3.5 text-brand" />
    ) : (
      <ChevronDown className="size-3.5 text-brand" />
    );
  };

  /* ────────────────── Choose view ────────────────── */
  if (view === 'choose') {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-surface-1">
        <PageHeader title="Start Screening">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/steps')}
            className="text-text-secondary gap-2"
          >
            <ArrowLeft className="size-4" /> Home
          </Button>
        </PageHeader>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-8 max-w-md w-full">
            {/* Select Existing */}
            <button
              onClick={() => setView('existing')}
              className="group w-full cursor-pointer rounded-2xl border-2 border-border bg-surface-0 p-8 text-left hover:border-brand hover:shadow-lg hover:shadow-brand/5"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 group-hover:bg-brand/20">
                  <FolderOpen className="size-7 text-brand" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-brand">
                    Select Existing Screen
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Continue from where you left off on a previous screening
                  </p>
                </div>
              </div>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 w-full">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-widest">
                or
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Start New */}
            <button
              onClick={() => navigate('/screenings/new')}
              className="group w-full cursor-pointer rounded-2xl border-2 border-border bg-surface-0 p-8 text-left hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/5"
            >
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20">
                  <PlusCircle className="size-7 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground group-hover:text-emerald-600">
                    Start a New Screen
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Upload a form and begin a brand‑new screening workflow
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────── Existing screens table view ────────────────── */
  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Select Existing Screen">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('choose')}
          className="text-text-secondary gap-2"
        >
          <ArrowLeft className="size-4" /> Back
        </Button>
      </PageHeader>

      {/* Search bar */}
      <div className="px-6 pt-5 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by screen name, submitter, or criteria…"
            className="pl-10 bg-surface-0 h-10"
          />
        </div>
        {loadingScreens && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="size-4 animate-spin text-brand" /> Loading screen database…
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="rounded-xl border bg-surface-0 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {[
                  { key: 'screenName' as SortKey, label: 'Screen Name' },
                  { key: 'submitterName' as SortKey, label: 'Submitter' },
                  { key: 'incomingDate' as SortKey, label: 'Incoming' },
                  { key: 'deadlineDate' as SortKey, label: 'Deadline' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort(key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {label} <SortIcon col={key} />
                    </span>
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">
                  Investment Criteria
                </th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">
                  Pipeline
                </th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">
                  Status
                </th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filteredScreens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-text-tertiary">
                    No screens found.
                  </td>
                </tr>
              ) : (
                filteredScreens.map((screen) => (
                  <tr
                    key={screen.id}
                    className={cn(
                      'border-b last:border-0 cursor-pointer',
                      selectedScreenId === screen.id ? 'bg-brand/10' : 'hover:bg-brand/[0.03]',
                    )}
                    onClick={() => setSelectedScreenId(screen.id)}
                    onDoubleClick={() => setRestoreTarget(screen)}
                  >
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      {screen.screenName}
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary">
                      {screen.submitterName}
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary tabular-nums">
                      {fmtDate(screen.incomingDate)}
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary tabular-nums">
                      {fmtDate(screen.deadlineDate)}
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary max-w-[280px]">
                      <span className="line-clamp-2">{screen.investmentCriteria}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        variant="outline"
                        className="text-xs font-medium whitespace-nowrap"
                      >
                        {screen.pipelineStep}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      {screen.isOngoing ? (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-xs">
                          Ongoing
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-xs">
                          Completed
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-text-tertiary hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(screen);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Restore confirmation dialog ── */}
      <Dialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Screen Progress</DialogTitle>
            <DialogDescription>
              Do you want to restore the progress of{' '}
              <strong className="text-foreground">{restoreTarget?.screenName}</strong>?
              You will be taken to{' '}
              <strong className="text-foreground">{restoreTarget?.pipelineStep}</strong>,
              the last active step.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={handleConfirmRestore}
              className="bg-brand text-brand-fg hover:bg-brand-hover gap-2"
            >
              Yes, Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <DialogTitle>Delete Screen</DialogTitle>
            </div>
            <DialogDescription>
              Are you sure you want to permanently delete{' '}
              <strong className="text-foreground">{deleteTarget?.screenName}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="gap-2"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
