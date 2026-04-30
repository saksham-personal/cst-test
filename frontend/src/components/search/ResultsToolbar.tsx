import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Check, ChevronDown, Download, Plus, Clock, CheckSquare, Square, ListFilter } from 'lucide-react';
import { ExportDialog } from './ExportDialog';
import { AddToListDialog } from './AddToListDialog';
import { useSearchStore } from '../../stores/searchStore';
import type { ResultsGridColumnControls } from './ResultsGrid';

interface ResultsToolbarProps {
  totalCount: number;
  searchId: string | null;
  searchTimeMs?: number | null;
  isSearching?: boolean;
  columnControls?: ResultsGridColumnControls | null;
  selectedOnlyView?: boolean;
  onToggleSelectedOnly?: () => void;
}

export function ResultsToolbar({
  totalCount,
  searchId,
  searchTimeMs,
  isSearching,
  columnControls,
  selectedOnlyView = false,
  onToggleSelectedOnly,
}: ResultsToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const selectedRows = useSearchStore((s) => s.selectedRows);
  const lastResult = useSearchStore((s) => s.lastResult);
  const selectAllResults = useSearchStore((s) => s.selectAllResults);
  const setSelectAllResults = useSearchStore((s) => s.setSelectAllResults);
  const selectedCount = selectedRows.length;
  const columnMenuRef = useRef<HTMLDivElement | null>(null);

  // "Select all" toggles a server-side add-all-from-search mode that adds the
  // full cached result set by searchId (instead of serializing every row).
  const canAdd = selectAllResults ? totalCount > 0 : selectedCount > 0;
  const rowsForAdd = selectAllResults ? [] : selectedRows;

  const sourceKeywords = lastResult
    ? Object.keys(lastResult.keyword_hit_counts || {})
    : [];

  const visibleColumnCount = columnControls
    ? columnControls.items.filter((item) => columnControls.visibility[item.colId] !== false).length
    : 0;

  useEffect(() => {
    if (!columnsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!columnMenuRef.current?.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [columnsOpen]);

  useEffect(() => {
    if (!columnControls) {
      setColumnsOpen(false);
    }
  }, [columnControls]);

  return (
    <div className="flex items-center justify-between py-3 border-b border-border bg-surface-0 px-4 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          data-shortcut-target="results-select-all"
          onClick={() => setSelectAllResults(!selectAllResults)}
          disabled={!searchId || totalCount === 0}
          className={
            'inline-flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors ' +
            (selectAllResults
              ? 'bg-brand/10 text-brand border-brand/30'
              : 'bg-surface-1 text-text-secondary border-border hover:bg-surface-2 hover:text-text-primary') +
            ' disabled:opacity-40 disabled:cursor-not-allowed'
          }
          title={
            selectAllResults
              ? `All ${totalCount.toLocaleString()} results are selected for Add to List`
              : 'Select every result across all pages for Add to List'
          }
        >
          {selectAllResults ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
          <span>Select all {totalCount > 0 ? `(${totalCount.toLocaleString()})` : ''}</span>
        </button>

        <span className="text-sm font-medium text-text-secondary bg-surface-1 px-3 py-1.5 rounded-md whitespace-nowrap">
          {isSearching ? (
            <span className="inline-flex items-center gap-2 text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              Searching…
            </span>
          ) : totalCount > 0 ? (
            <>
              Total: <span className="font-bold text-text-primary">{totalCount.toLocaleString()}</span>
            </>
          ) : (
            <span className="text-text-tertiary">No results</span>
          )}
        </span>

        {selectAllResults ? (
          <span className="text-xs font-medium text-brand bg-brand/10 px-2 py-1 rounded-md whitespace-nowrap">
            All {totalCount.toLocaleString()} selected
          </span>
        ) : selectedCount > 0 ? (
          <span className="text-xs font-medium text-brand bg-brand/10 px-2 py-1 rounded-md whitespace-nowrap">
            {selectedCount.toLocaleString()} selected
          </span>
        ) : null}

        <button
          type="button"
          onClick={onToggleSelectedOnly}
          disabled={!selectedOnlyView && selectedCount === 0}
          className={
            'inline-flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors ' +
            (selectedOnlyView
              ? 'bg-info/10 text-info border-info/30'
              : 'bg-surface-1 text-text-secondary border-border hover:bg-surface-2 hover:text-text-primary') +
            ' disabled:opacity-40 disabled:cursor-not-allowed'
          }
          title={selectedOnlyView ? 'Show all results again' : 'Show only the selected rows'}
        >
          <ListFilter className="size-4" />
          <span>{selectedOnlyView ? 'All Results' : 'Selected Only'}</span>
        </button>

        {searchTimeMs != null && !isSearching && (
          <span className="inline-flex items-center gap-1 text-xs text-text-tertiary whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {searchTimeMs.toFixed(0)}ms
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div ref={columnMenuRef} className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-text-secondary/30 bg-surface-1 hover:bg-surface-2 hover:border-text-secondary/45"
            onClick={() => setColumnsOpen((open) => !open)}
            disabled={!columnControls}
          >
            Columns {columnControls ? `(${visibleColumnCount})` : ''}
            <ChevronDown className={'ml-2 size-4 transition-transform ' + (columnsOpen ? 'rotate-180' : '')} />
          </Button>

          {columnsOpen && columnControls && (
            <div className="absolute right-0 top-full z-40 mt-2 w-[520px] overflow-hidden rounded-xl border border-text-secondary/20 bg-surface-0 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">Visible columns</div>
                  <div className="text-xs text-text-tertiary">
                    {visibleColumnCount} of {columnControls.items.length} selected
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="font-medium text-brand hover:underline"
                    onClick={() => columnControls.showAllColumns()}
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    className="font-medium text-text-secondary hover:text-text-primary"
                    onClick={() => columnControls.resetColumns()}
                  >
                    Reset layout
                  </button>
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {columnControls.items.map((item) => {
                    const isVisible = columnControls.visibility[item.colId] !== false;
                    return (
                      <button
                        type="button"
                        key={item.colId}
                        role="checkbox"
                        aria-checked={isVisible}
                        tabIndex={0}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary hover:bg-surface-2"
                        onClick={() => columnControls.toggleColumn(item.colId, !isVisible)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            columnControls.toggleColumn(item.colId, !isVisible);
                          }
                        }}
                      >
                        <span
                          aria-hidden
                          className={
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                            (isVisible
                              ? 'border-brand bg-brand text-brand-fg'
                              : 'border-border bg-surface-0 text-transparent')
                          }
                        >
                          {isVisible && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-9"
          data-shortcut-target="results-export"
          onClick={() => setExportOpen(true)}
          disabled={!searchId || totalCount === 0}
        >
          <Download className="size-4 mr-2" /> Export
        </Button>

        <Button
          size="sm"
          className="h-9 bg-brand text-brand-fg hover:bg-brand-hover disabled:opacity-50"
          data-shortcut-target="results-add-to-list"
          onClick={() => setAddToListOpen(true)}
          disabled={!canAdd}
          title={
            canAdd
              ? (selectAllResults
                  ? `Add all ${totalCount.toLocaleString()} results to a list`
                  : 'Add selected rows to a list')
              : 'Select rows or toggle "Select all" first'
          }
        >
          <Plus className="size-4 mr-2" /> Add to List
        </Button>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        searchId={searchId}
        totalCount={totalCount}
      />

      <AddToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        rows={rowsForAdd}
        sourceKeywords={sourceKeywords}
        selectAll={selectAllResults}
        searchId={searchId}
        totalCount={totalCount}
      />
    </div>
  );
}
