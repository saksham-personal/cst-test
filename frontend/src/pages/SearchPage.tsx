import { useCallback, useEffect, useRef, useState } from 'react';
import { KeywordBuilder } from '../components/search/KeywordBuilder';
import { QueryBox } from '../components/search/QueryBox';
import { ResultsToolbar } from '../components/search/ResultsToolbar';
import { ResultsGrid, type ResultsGridColumnControls } from '../components/search/ResultsGrid';
import { ResultsRowDetailDrawer } from '../components/search/ResultsRowDetailDrawer';
import { AddToListDialog } from '../components/search/AddToListDialog';
import { RecentSearches } from '../components/search/RecentSearches';
import { SearchResultRow, SearchPageResponse } from '../api/types';
import { useSearch, buildSearchPayload } from '../hooks/useSearch';
import { useSearchShortcuts } from '../hooks/useSearchShortcuts';
import { useSearchStore } from '../stores/searchStore';
import { toast } from 'sonner';

// Splitter bounds — the top (builder) pane must stay usable and the bottom
// (results) pane must always fit at least a toolbar + a few rows.
const MIN_TOP_PX = 180;
const MIN_BOTTOM_PX = 220;
const DEFAULT_TOP_PX = 320;
const TOP_PANE_KEY = 'company-screener-top-pane-h';

function readStoredTopPx(): number {
  try {
    const raw = localStorage.getItem(TOP_PANE_KEY);
    if (!raw) return DEFAULT_TOP_PX;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TOP_PX;
  } catch {
    return DEFAULT_TOP_PX;
  }
}

export function SearchPage() {
  useSearchShortcuts();

  const [selectedRow, setSelectedRow] = useState<SearchResultRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchPageResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [drawerAddListOpen, setDrawerAddListOpen] = useState(false);
  const [drawerAddRow, setDrawerAddRow] = useState<SearchResultRow | null>(null);
  const [columnControls, setColumnControls] = useState<ResultsGridColumnControls | null>(null);

  // Splitter state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [topPx, setTopPx] = useState<number>(() => readStoredTopPx());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; topPx: number } | null>(null);

  const searchMutation = useSearch();
  const setLastResult = useSearchStore((s) => s.setLastResult);
  const selectedOnlyView = useSearchStore((s) => s.selectedOnlyView);
  const setSelectedOnlyView = useSearchStore((s) => s.setSelectedOnlyView);

  const handleRowClick = (row: SearchResultRow) => {
    setSelectedRow(row);
    setIsDrawerOpen(true);
  };

  const handleSearch = useCallback(() => {
    const payload = buildSearchPayload(1, 100);
    if (payload.keywords.length === 0) {
      toast.warning('Add at least one keyword before searching.');
      return;
    }
    setHasSearched(true);
    searchMutation.mutate(payload, {
      onSuccess: (data) => {
        setSearchResult(data);
        setLastResult(data);
        toast.success(
          `Found ${data.total_count.toLocaleString()} results in ${data.timings_ms?.total?.toFixed(0) ?? '?'}ms`,
        );
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.detail || 'Search failed';
        toast.error(typeof msg === 'string' ? msg : 'Search failed');
      },
    });
  }, [searchMutation, setLastResult]);

  const handleDrawerAddToList = (row: SearchResultRow) => {
    setDrawerAddRow(row);
    setDrawerAddListOpen(true);
  };

  // Splitter drag handlers — direct DOM reads against container height so
  // we clamp against whatever the actual viewport is right now.
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { y: e.clientY, topPx };
      setIsDragging(true);
    },
    [topPx],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;
      const containerH = containerRef.current.clientHeight;
      const delta = e.clientY - dragStartRef.current.y;
      const next = dragStartRef.current.topPx + delta;
      const maxTop = Math.max(MIN_TOP_PX, containerH - MIN_BOTTOM_PX);
      const clamped = Math.min(maxTop, Math.max(MIN_TOP_PX, next));
      setTopPx(clamped);
    };
    const onUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      try { localStorage.setItem(TOP_PANE_KEY, String(topPx)); } catch {}
    };
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isDragging, topPx]);

  const sourceKeywords = searchResult
    ? Object.keys(searchResult.keyword_hit_counts || {})
    : [];

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden bg-surface-1">
      {/* Top pane — builder */}
      <div
        className="flex-none overflow-y-auto border-b shadow-sm z-10 bg-surface-1"
        style={{ height: `${topPx}px` }}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold font-sans tracking-tight text-text-primary">Search</h1>
            <RecentSearches />
          </div>

          <KeywordBuilder />
          <QueryBox onSearch={handleSearch} isLoading={searchMutation.isPending} />
        </div>
      </div>

      {/* Draggable splitter — 6px hit area with a 2px visible rail, turns brand on hover/drag */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize • Double-click to reset"
        onMouseDown={onDragStart}
        onDoubleClick={() => {
          setTopPx(DEFAULT_TOP_PX);
          try { localStorage.setItem(TOP_PANE_KEY, String(DEFAULT_TOP_PX)); } catch {}
        }}
        className={
          'group relative h-1.5 w-full cursor-row-resize select-none ' +
          (isDragging ? 'bg-brand/20' : 'bg-border/70 hover:bg-brand/15')
        }
      >
        <div
          className={
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] w-16 rounded-full transition-colors ' +
            (isDragging ? 'bg-brand' : 'bg-border group-hover:bg-brand')
          }
        />
      </div>

      {/* Bottom pane — results */}
      <div className="flex-1 flex flex-col min-h-0 relative bg-surface-0">
        <ResultsToolbar
          totalCount={searchResult?.total_count ?? 0}
          searchId={searchResult?.search_id ?? null}
          searchTimeMs={searchResult?.timings_ms?.total ?? null}
          isSearching={searchMutation.isPending}
          columnControls={columnControls}
          selectedOnlyView={selectedOnlyView}
          onToggleSelectedOnly={() => setSelectedOnlyView(!selectedOnlyView)}
        />
        <ResultsGrid
          searchId={searchResult?.search_id ?? null}
          initialResults={searchResult?.results ?? []}
          totalCount={searchResult?.total_count ?? 0}
          pageSize={searchResult?.page_size ?? 100}
          isLoading={searchMutation.isPending}
          hasSearched={hasSearched}
          onRowClick={handleRowClick}
          onColumnControlsChange={setColumnControls}
          selectedOnlyView={selectedOnlyView}
        />
      </div>

      <ResultsRowDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        row={selectedRow}
        onAddToList={handleDrawerAddToList}
      />

      <AddToListDialog
        open={drawerAddListOpen}
        onOpenChange={setDrawerAddListOpen}
        rows={drawerAddRow ? [drawerAddRow] : []}
        sourceKeywords={sourceKeywords}
      />
    </div>
  );
}
