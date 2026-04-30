import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { clearHistory, getHistory } from '../../api/endpoints';
import type { HistoryEntry } from '../../api/types';
import { useSearchStore, type Keyword } from '../../stores/searchStore';
import { toast } from 'sonner';

const MAX_SHOWN = 100;

function formatTimestamp(raw: string): string {
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return raw;
  }
}

function summarize(entry: HistoryEntry): string {
  // Preferred: the parsed query (what the user typed / what the engine saw).
  if (entry.parsed_query) return entry.parsed_query;
  if (entry.query_expression) return entry.query_expression;
  const kws = (entry.keywords || []).map((k) => k.keyword).filter(Boolean);
  if (kws.length === 0) return '(empty)';
  if (kws.length <= 3) return kws.join(' · ');
  return `${kws.slice(0, 3).join(' · ')} +${kws.length - 3} more`;
}

/** Dropdown showing the last N recent searches. Clicking one RESTORES the
 *  keywords + query expression into the builder without auto-executing; the
 *  analyst presses Search themselves. */
export function RecentSearches() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const setKeywords = useSearchStore((s) => s.setKeywords);
  const setQueryExpression = useSearchStore((s) => s.setQueryExpression);

  const load = async () => {
    setLoading(true);
    try {
      const list = await getHistory();
      setEntries(Array.isArray(list) ? list.slice(0, MAX_SHOWN) : []);
    } catch {
      toast.error('Could not load search history');
    } finally {
      setLoading(false);
    }
  };

  // Lazy-load the first time the popover opens.
  useEffect(() => {
    if (open && entries.length === 0 && !loading) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleRestore = (entry: HistoryEntry) => {
    const ks: Keyword[] = (entry.keywords || []).map((k) => ({
      id: crypto.randomUUID(),
      keyword: k.keyword || '',
      mode: (k.mode as any) || 'lexical',
      action: (k.action as any) || 'include',
      weight: typeof k.weight === 'number' ? k.weight : 1,
    }));
    setKeywords(ks);
    setQueryExpression(entry.query_expression || '');
    setOpen(false);
    toast.message('Restored from history', {
      description: 'Press Search to run this query again.',
    });
  };

  const handleClear = async () => {
    try {
      await clearHistory();
      setEntries([]);
      toast.success('History cleared');
    } catch {
      toast.error('Failed to clear history');
    }
  };

  const hasEntries = useMemo(() => entries.length > 0, [entries]);

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        className="gap-1.5 h-8"
        onClick={() => setOpen((v) => !v)}
        title="Recent searches"
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Recent</span>
      </Button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] z-50 rounded-lg border border-border bg-surface-0 shadow-xl ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-1 rounded-t-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              <Clock className="h-3 w-3" />
              Recent searches
              <span className="ml-1 font-mono tabular-nums text-text-tertiary">· last {MAX_SHOWN}</span>
            </div>
            <div className="flex items-center gap-1">
              {hasEntries && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-text-tertiary hover:text-danger"
                  onClick={handleClear}
                  title="Clear history"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-text-tertiary"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
              </div>
            ) : !hasEntries ? (
              <div className="px-3 py-8 text-center text-sm text-text-tertiary italic">
                No recent searches yet.
              </div>
            ) : (
              <ul className="flex flex-col">
                {entries.map((entry, idx) => (
                  <li key={`${entry.timestamp}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleRestore(entry)}
                      className="w-full px-3 py-2 text-left hover:bg-brand/5 focus:bg-brand/5 focus:outline-none transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm text-brand truncate flex-1 min-w-0">
                          {summarize(entry)}
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-text-tertiary shrink-0">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-text-tertiary">
                        <span className="font-mono tabular-nums">
                          {entry.result_count.toLocaleString()} results
                        </span>
                        <span>·</span>
                        <span>{entry.search_mode === 'expression' ? 'Expression' : 'Default'}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-brand font-semibold flex items-center gap-0.5">
                          <RotateCcw className="h-2.5 w-2.5" /> Restore
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border bg-surface-1 rounded-b-lg text-[10px] text-text-tertiary">
            Click a row to restore its keywords and query into the builder. Search is not auto-run.
          </div>
        </div>
      )}
    </div>
  );
}
