import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Search as SearchIcon,
  Plus,
  Trash2,
  List as ListIcon,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  getLists,
  getListDetail,
  getListCompanyDetail,
  createList,
  deleteList,
  removeCompaniesFromList,
} from '../api/endpoints';
import type { ListSummary, ListCompanyEntry, ListCompanyDetail } from '../api/endpoints';
import { toast } from 'sonner';
import { ExportDialog } from '../components/search/ExportDialog';
import { ListCompanyDetailDrawer } from '../components/lists/ListCompanyDetailDrawer';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ColDef, SelectionChangedEvent, GridReadyEvent, GridApi, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);

function getCompanyKey(c: ListCompanyEntry): string {
  // The primary key is Crescendo ID. Fall back to the legacy company-name key
  // so older stored entries still resolve.
  return c.primary_key_value || c.crescendo_id || c.company || '';
}

function formatAdded(raw?: string): string {
  if (!raw) return '-';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return raw;
  }
}

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      '.ag-selection-checkbox, .ag-checkbox-input-wrapper, .ag-checkbox-input, [data-slot="checkbox"], a, button',
    ),
  );
}

export function ListsPage() {
  const [filterText, setFilterText] = useState('');
  const [listSummaries, setListSummaries] = useState<ListSummary[]>([]);
  const [selectedList, setSelectedList] = useState<string>('');
  const [listCompanies, setListCompanies] = useState<ListCompanyEntry[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCompanyDetail, setLoadingCompanyDetail] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<ListCompanyDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);

  const gridApiRef = useRef<GridApi<ListCompanyEntry> | null>(null);
  const companyDetailCacheRef = useRef<Record<string, ListCompanyDetail>>({});
  const companyDetailRequestRef = useRef(0);

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const data = await getLists();
      setListSummaries(Array.isArray(data?.lists) ? data.lists : []);
    } catch {
      toast.error('Failed to load lists (is the backend running?)');
    } finally {
      setLoadingLists(false);
    }
  };

  const loadDetail = async (name: string) => {
    setLoadingDetail(true);
    setSelectedKeys(new Set());
    setDrawerOpen(false);
    setLoadingCompanyDetail(false);
    setSelectedCompanyDetail(null);
    companyDetailCacheRef.current = {};
    companyDetailRequestRef.current += 1;
    try {
      const detail = await getListDetail(name);
      setListCompanies(Array.isArray(detail?.companies) ? detail.companies : []);
    } catch {
      toast.error('Failed to load list');
      setListCompanies([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadLists();
  }, []);

  // Apply the toolbar quick-filter to the grid directly — AG Grid handles
  // tokenization, index-based matching, and row virtualization for us.
  useEffect(() => {
    gridApiRef.current?.setGridOption('quickFilterText', filterText);
  }, [filterText]);

  const handleSelectList = (name: string) => {
    setSelectedList(name);
    loadDetail(name);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createList(name);
      toast.success(`Created "${name}"`);
      setNewName('');
      setCreateOpen(false);
      await loadLists();
      handleSelectList(name);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create list');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedList) return;
    setDeleting(true);
    try {
      await deleteList(selectedList);
      toast.success(`Deleted "${selectedList}"`);
      setSelectedList('');
      setListCompanies([]);
      setSelectedCompanyDetail(null);
      setDrawerOpen(false);
      setDeleteOpen(false);
      await loadLists();
    } catch {
      toast.error('Failed to delete list');
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveSelected = async () => {
    if (!selectedList || selectedKeys.size === 0) return;
    const names = Array.from(selectedKeys);
    const toastId = toast.loading(`Removing ${names.length} compan${names.length === 1 ? 'y' : 'ies'}…`);
    try {
      await removeCompaniesFromList(selectedList, names);
      toast.success(`Removed ${names.length}`, { id: toastId });
      await loadDetail(selectedList);
    } catch {
      toast.error('Remove failed', { id: toastId });
    }
  };

  const onGridReady = useCallback((ev: GridReadyEvent<ListCompanyEntry>) => {
    gridApiRef.current = ev.api;
  }, []);

  const onSelectionChanged = useCallback((ev: SelectionChangedEvent<ListCompanyEntry>) => {
    const nextKeys = new Set<string>();
    ev.api.getSelectedRows().forEach((row) => {
      const key = getCompanyKey(row);
      if (key) nextKeys.add(key);
    });
    setSelectedKeys(nextKeys);
  }, []);

  const handleRowClicked = useCallback(async (ev: RowClickedEvent<ListCompanyEntry>) => {
    if (!selectedList || !ev.data) return;
    if (shouldIgnoreRowClick(ev.event?.target ?? null)) return;

    const companyKey = getCompanyKey(ev.data);
    if (!companyKey) return;

    const cached = companyDetailCacheRef.current[companyKey];
    setSelectedCompanyDetail(cached || { ...ev.data, metadata: {} });
    setDrawerOpen(true);

    if (cached) {
      setLoadingCompanyDetail(false);
      return;
    }

    const requestId = companyDetailRequestRef.current + 1;
    companyDetailRequestRef.current = requestId;
    setLoadingCompanyDetail(true);

    try {
      const detail = await getListCompanyDetail(selectedList, companyKey);
      companyDetailCacheRef.current[companyKey] = detail;
      if (companyDetailRequestRef.current !== requestId) return;
      setSelectedCompanyDetail(detail);
    } catch {
      if (companyDetailRequestRef.current !== requestId) return;
      toast.error('Failed to load company details');
    } finally {
      if (companyDetailRequestRef.current === requestId) {
        setLoadingCompanyDetail(false);
      }
    }
  }, [selectedList]);

  const columnDefs = useMemo<ColDef<ListCompanyEntry>[]>(
    () => [
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
      {
        field: 'primary_key_value',
        headerName: 'Crescendo ID',
        width: 160,
        filter: 'agTextColumnFilter',
        cellClass: 'font-mono text-xs',
        valueGetter: (p) => p.data?.primary_key_value || p.data?.crescendo_id || '-',
      },
      {
        field: 'company',
        headerName: 'Company',
        flex: 2,
        minWidth: 220,
        filter: 'agTextColumnFilter',
        cellClass: 'font-medium',
        valueGetter: (p) => p.data?.company || p.data?.primary_key_value || '-',
      },
      {
        field: 'source_keywords',
        headerName: 'Source Keywords',
        flex: 2,
        minWidth: 220,
        filter: 'agTextColumnFilter',
        valueGetter: (p) =>
          Array.isArray(p.data?.source_keywords) && p.data.source_keywords.length
            ? p.data.source_keywords.join(', ')
            : '-',
        tooltipValueGetter: (p) => p.value as string,
      },
      {
        field: 'added_at',
        headerName: 'Added',
        width: 150,
        filter: 'agDateColumnFilter',
        valueFormatter: (p) => formatAdded(p.value),
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
      floatingFilter: false,
    }),
    [],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Lists" />

      <div className="flex-1 overflow-hidden p-4 flex gap-4">
        {/* Sidebar list of lists */}
        <aside className="w-64 flex-shrink-0 flex flex-col gap-3 bg-card p-3 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              My Lists
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={loadLists}
              disabled={loadingLists}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLists ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4 mr-2" /> New List
          </Button>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {loadingLists && listSummaries.length === 0 ? (
              <div className="p-4 text-sm text-text-tertiary flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : listSummaries.length === 0 ? (
              <div className="p-4 text-sm text-text-tertiary italic text-center">
                No lists yet.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {listSummaries.map((summary) => (
                  <li key={summary.name}>
                    <button
                      onClick={() => handleSelectList(summary.name)}
                      className={
                        'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ' +
                        (selectedList === summary.name
                          ? 'bg-brand/10 text-brand font-medium'
                          : 'text-text-primary hover:bg-surface-1')
                      }
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ListIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{summary.name}</span>
                      </span>
                      <span
                        className={
                          'text-[10px] font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded ' +
                          (selectedList === summary.name
                            ? 'bg-brand/20'
                            : 'bg-surface-2 text-text-tertiary')
                        }
                      >
                        {summary.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Detail pane */}
        <main className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-3 bg-card p-3 rounded-lg border shadow-sm">
            <div className="flex-1 min-w-0">
              {selectedList ? (
                <>
                  <div className="text-sm font-semibold text-text-primary truncate">{selectedList}</div>
                  <div className="text-xs text-text-tertiary">
                    {listCompanies.length.toLocaleString()} compan{listCompanies.length === 1 ? 'y' : 'ies'}
                    {selectedKeys.size > 0 && (
                      <>
                        {' '}· <span className="text-brand font-medium">{selectedKeys.size} selected</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-text-tertiary italic">Select a list to view companies.</div>
              )}
            </div>

            <div className="relative w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" />
              <Input
                placeholder="Filter list…"
                value={filterText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterText(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedList && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedKeys.size === 0}
                  onClick={handleRemoveSelected}
                  className="text-danger hover:bg-danger/10 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Trash2 className="size-4 mr-1" /> Remove
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportOpen(true)}
                  disabled={listCompanies.length === 0}
                >
                  <Download className="size-4 mr-1" /> Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4 mr-1" /> Delete list
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 min-h-0 border rounded-lg bg-card shadow-sm overflow-hidden relative">
            {loadingDetail && (
              <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-surface-0/70 backdrop-blur-[1px] text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading companies…
              </div>
            )}
            {!selectedList ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground italic h-full">
                Select a list to view its companies.
              </div>
            ) : (
              <div className="ag-theme-quartz ag-premium-headers h-full w-full">
                <AgGridReact<ListCompanyEntry>
                  theme="legacy"
                  rowData={listCompanies}
                  columnDefs={columnDefs}
                  defaultColDef={defaultColDef}
                  onGridReady={onGridReady}
                  onSelectionChanged={onSelectionChanged}
                  onRowClicked={handleRowClicked}
                  rowSelection="multiple"
                  suppressRowClickSelection
                  rowHeight={38}
                  headerHeight={42}
                  animateRows={false}
                  rowClass="cursor-pointer hover:bg-surface-1"
                  getRowId={(p) => getCompanyKey(p.data) || String(Math.random())}
                  overlayNoRowsTemplate={`<div class='text-text-tertiary italic py-8 text-sm'>${filterText ? 'No companies match your filter.' : 'This list is empty.'}</div>`}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      <ListCompanyDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        company={selectedCompanyDetail}
        isLoading={loadingCompanyDetail}
      />

      {/* Create list dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent showCloseButton className="!max-w-md !w-[420px]">
          <DialogHeader>
            <DialogTitle>Create new list</DialogTitle>
            <DialogDescription>Give the list a short, memorable name.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Q2 Outbound Targets"
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export modal — same PB / Excel / CSV options as the search page */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        source="list"
        listName={selectedList || null}
        totalCount={listCompanies.length}
      />

      {/* Confirm delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton className="!max-w-md !w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete this list?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{selectedList}</strong> and all
              {' '}{listCompanies.length.toLocaleString()} compan{listCompanies.length === 1 ? 'y' : 'ies'}{' '}
              it contains. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
