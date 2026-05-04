import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../components/ui/select';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
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
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  getLists,
  getListDetail,
  getListCompanyDetail,
  createList,
  deleteList,
  generateLLMScreeningPrompts,
  listScreenings,
  removeCompaniesFromList,
} from '../api/endpoints';
import type { ListSummary, ListCompanyEntry, ListCompanyDetail, ListDetail } from '../api/endpoints';
import type { ScreeningSummary } from '../api/types';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '../api/client';
import { ExportDialog } from '../components/search/ExportDialog';
import { ListCompanyDetailDrawer } from '../components/lists/ListCompanyDetailDrawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { useScreenStore } from '../stores/screenStore';
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

function isLLMGeneratedListName(name: string): boolean {
  return /(?:^|[_\s-])listafterllm$/i.test(name) || /_listafterllm$/i.test(name) || /llm/i.test(name);
}

function getScreenDisplayName(screen?: ScreeningSummary | null): string {
  return screen?.screen_name || screen?.original_filename || screen?.id || '';
}
 
export function ListsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeScreen = useScreenStore((state) => state.activeScreen);
  const ALL_SCREENS_VALUE = '__all__';
  const NO_SCREEN_VALUE = '__none__';
  const ASSOCIATED_SCREENS_VALUE = '__associated__';
  const [filterAssociation, setFilterAssociation] = useState<'none' | 'associated'>('associated');
  const [createAssociation, setCreateAssociation] = useState<'none' | 'associated'>('none');
  const [createScreeningId, setCreateScreeningId] = useState<string>('');
  const [filterText, setFilterText] = useState('');
  const [listSummaries, setListSummaries] = useState<ListSummary[]>([]);
  const [screeningOptions, setScreeningOptions] = useState<ScreeningSummary[]>([]);
  const [selectedScreeningId, setSelectedScreeningId] = useState<string>(activeScreen?.id ?? ALL_SCREENS_VALUE);
  const [selectedList, setSelectedList] = useState<string>('');
  const [selectedListDetail, setSelectedListDetail] = useState<ListDetail | null>(null);
  const [listCompanies, setListCompanies] = useState<ListCompanyEntry[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCompanyDetail, setLoadingCompanyDetail] = useState(false);
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [promptGenerationError, setPromptGenerationError] = useState<string | null>(null);
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
  const lastDefaultActiveScreenIdRef = useRef<string | null>(activeScreen?.id ?? null);

  const screeningOptionsWithActive = useMemo<ScreeningSummary[]>(() => {
    if (!activeScreen?.id || screeningOptions.some((screen) => screen.id === activeScreen.id)) {
      return screeningOptions;
    }

    return [
      {
        id: activeScreen.id,
        screen_name: activeScreen.screenName,
        status: activeScreen.pipelineStatus === 'paused' ? 'draft' : 'screening_started',
        pipeline_step: 1,
        pipeline_status: activeScreen.pipelineStep,
        is_active: true,
        curr_final_criteria: activeScreen.currFinalCriteria ?? null,
        original_filename: activeScreen.originalFilename || activeScreen.screenName,
        updated_at: '',
      },
      ...screeningOptions,
    ];
  }, [activeScreen, screeningOptions]);

  const listFilterParam = filterAssociation === 'none'
    ? NO_SCREEN_VALUE
    : selectedScreeningId === ALL_SCREENS_VALUE
      ? ASSOCIATED_SCREENS_VALUE
      : selectedScreeningId;

  const formatTooltipDate = (raw?: string): string => {
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const datePart = date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} at ${timePart}`;
  };

  const loadLists = useCallback(async (screeningId: string | null = listFilterParam) => {
    setLoadingLists(true);
    try {
      const data = await getLists(screeningId);
      setListSummaries(Array.isArray(data?.lists) ? data.lists : []);
    } catch {
      toast.error('Failed to load lists (is the backend running?)');
    } finally {
      setLoadingLists(false);
    }
  }, [listFilterParam]);

  const loadScreeningOptions = useCallback(async () => {
    try {
      const data = await listScreenings();
      setScreeningOptions(Array.isArray(data) ? data : []);
    } catch {
      setScreeningOptions([]);
    }
  }, []);

  const loadDetail = useCallback(async (name: string): Promise<ListDetail | null> => {
    setLoadingDetail(true);
    setSelectedKeys(new Set());
    setDrawerOpen(false);
    setLoadingCompanyDetail(false);
    setSelectedCompanyDetail(null);
    companyDetailCacheRef.current = {};
    companyDetailRequestRef.current += 1;
    try {
      const detail = await getListDetail(name);
      setSelectedListDetail(detail);
      setListCompanies(Array.isArray(detail?.companies) ? detail.companies : []);
      return detail;
    } catch {
      toast.error('Failed to load list');
      setSelectedListDetail(null);
      setListCompanies([]);
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadScreeningOptions();
  }, [loadScreeningOptions]);

  useEffect(() => {
    if (!activeScreen?.id) return;
    if (lastDefaultActiveScreenIdRef.current === activeScreen.id) return;

    lastDefaultActiveScreenIdRef.current = activeScreen.id;
    setFilterAssociation('associated');
    setSelectedScreeningId(activeScreen.id);
    setSelectedList('');
    setSelectedListDetail(null);
    setListCompanies([]);
    setSelectedCompanyDetail(null);
    setDrawerOpen(false);
  }, [activeScreen?.id]);

  useEffect(() => {
    void loadLists(listFilterParam);
  }, [loadLists, listFilterParam]);

  useEffect(() => {
    const navState = (location.state as { openListName?: string } | null) ?? null;
    if (!navState?.openListName) return;

    let cancelled = false;
    const openListFromNavigation = async () => {
      const detail = await loadDetail(navState.openListName as string);
      if (cancelled || !detail) return;
      setFilterAssociation(detail.screening_id ? 'associated' : 'none');
      setSelectedScreeningId(ALL_SCREENS_VALUE);
      setSelectedList(detail.name);
      navigate(location.pathname, { replace: true, state: null });
    };
    void openListFromNavigation();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.state, loadDetail, navigate]);

  useEffect(() => {
    if (selectedList && !listSummaries.some((summary) => summary.name === selectedList)) {
      setSelectedList('');
      setSelectedListDetail(null);
      setListCompanies([]);
      setSelectedCompanyDetail(null);
      setDrawerOpen(false);
    }
  }, [listSummaries, selectedList]);

  // Apply the toolbar quick-filter to the grid directly — AG Grid handles
  // tokenization, index-based matching, and row virtualization for us.
  useEffect(() => {
    gridApiRef.current?.setGridOption('quickFilterText', filterText);
  }, [filterText]);

  const handleSelectList = (name: string) => {
    setSelectedList(name);
    setPromptGenerationError(null);
    void loadDetail(name);
  };

  const selectedSummary = useMemo(
    () => listSummaries.find((summary) => summary.name === selectedList) ?? null,
    [listSummaries, selectedList],
  );

  const selectedListScreeningId = selectedListDetail?.screening_id ?? selectedSummary?.screening_id ?? null;
  const selectedListScreen = selectedListScreeningId
    ? screeningOptionsWithActive.find((screen) => screen.id === selectedListScreeningId) ?? null
    : null;
  const selectedListScreenName = selectedListDetail?.screen_name
    ?? selectedSummary?.screen_name
    ?? (getScreenDisplayName(selectedListScreen) || null);
  const selectedScreenAssociationLabel = selectedListScreenName || 'None';
  const selectedFilterScreen = selectedScreeningId !== ALL_SCREENS_VALUE
    ? screeningOptionsWithActive.find((screen) => screen.id === selectedScreeningId) ?? null
    : null;
  const currentFilterLabel = filterAssociation === 'none'
    ? 'Lists with no associated screen'
    : selectedScreeningId === ALL_SCREENS_VALUE
      ? 'All screen-associated lists'
      : getScreenDisplayName(selectedFilterScreen)
        || (activeScreen?.id === selectedScreeningId ? activeScreen.screenName : '')
        || selectedScreeningId;
  const createSelectedScreen = createScreeningId
    ? screeningOptionsWithActive.find((screen) => screen.id === createScreeningId) ?? null
    : null;
  const createSelectedScreenLabel = getScreenDisplayName(createSelectedScreen);

  const handleFilterAssociationChange = (value: string) => {
    const next = value === 'none' ? 'none' : 'associated';
    setFilterAssociation(next);
    setSelectedScreeningId(ALL_SCREENS_VALUE);
    setSelectedList('');
    setSelectedListDetail(null);
    setListCompanies([]);
    setSelectedCompanyDetail(null);
    setDrawerOpen(false);
  };

  const handleScreenFilterChange = (value: string | null) => {
    setSelectedScreeningId(value || ALL_SCREENS_VALUE);
    setSelectedList('');
    setSelectedListDetail(null);
    setListCompanies([]);
    setSelectedCompanyDetail(null);
    setDrawerOpen(false);
  };

  const handleRunLLMScreening = async () => {
    if (!selectedList) return;
    setPromptGenerationError(null);
    if (!selectedListScreeningId) {
      toast.info('Screen Associated is None. Fill the prompts before running LLM Screening.');
      navigate('/llm-screening', {
        state: {
          flow: 'platform',
          listName: selectedList,
          screeningId: null,
          prompts: { Yes: '', No: '', Maybe: '', Rationale: '' },
          needsPromptFill: true,
        },
      });
      return;
    }

    setGeneratingPrompts(true);
    const toastId = toast.loading(`Generating LLM screening prompts for "${selectedList}"…`);
    try {
      const response = await generateLLMScreeningPrompts({
        screening_id: selectedListScreeningId,
        rationale_enabled: true,
      });
      toast.success('Generated Yes/No/Maybe and Rationale prompts. Review and edit prompts before running.', { id: toastId });
      navigate('/llm-screening', {
        state: {
          flow: 'platform',
          listName: selectedList,
          screeningId: selectedListScreeningId,
          prompts: response.prompts,
        },
      });
    } catch (err: any) {
      const message = extractApiErrorMessage(err, 'LLM prompt generation failed or timed out.');
      setPromptGenerationError(message);
      toast.error(`${message} Use Try again.`, { id: toastId });
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const linkedScreen = createAssociation === 'associated'
        ? screeningOptionsWithActive.find((screen) => screen.id === createScreeningId) ?? null
        : null;
      await createList(name, linkedScreen?.id ?? null, getScreenDisplayName(linkedScreen) || null);
      toast.success(`Created "${name}"`);
      setNewName('');
      setCreateOpen(false);
      await loadLists(listFilterParam);
      handleSelectList(name);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to create list'));
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
      setSelectedListDetail(null);
      await loadLists(listFilterParam);
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
              onClick={() => { void loadLists(listFilterParam); }}
              disabled={loadingLists}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLists ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Filter by screen
            </label>
            <RadioGroup
              value={filterAssociation}
              onValueChange={handleFilterAssociationChange}
              className="grid grid-cols-1 gap-1.5"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-surface-0 px-2 py-1.5 text-xs">
                <Radio.Root value="none" className="flex size-4 items-center justify-center rounded-full border border-border bg-surface-0 data-[checked]:border-brand">
                  <Radio.Indicator className="size-2 rounded-full bg-brand" />
                </Radio.Root>
                No Screen Associated
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-surface-0 px-2 py-1.5 text-xs">
                <Radio.Root value="associated" className="flex size-4 items-center justify-center rounded-full border border-border bg-surface-0 data-[checked]:border-brand">
                  <Radio.Indicator className="size-2 rounded-full bg-brand" />
                </Radio.Root>
                Screen Associated
              </label>
            </RadioGroup>
            {filterAssociation === 'associated' && (
              <Select value={selectedScreeningId} onValueChange={handleScreenFilterChange}>
                <SelectTrigger className="w-full h-9 bg-surface-0 items-center text-left">
                  <span className="flex-1 truncate text-left">{currentFilterLabel}</span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value={ALL_SCREENS_VALUE}>All associated screens</SelectItem>
                  {screeningOptionsWithActive.map((screen) => (
                    <SelectItem key={screen.id} value={screen.id}>
                      {getScreenDisplayName(screen)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="rounded-md bg-surface-1 px-2 py-1 text-[11px] text-text-tertiary">
              Showing: <span className="font-medium text-text-secondary">{currentFilterLabel}</span>
            </div>
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
                {listSummaries.map((summary) => {
                  const isLLMGenerated = isLLMGeneratedListName(summary.name);
                  return (
                  <li key={summary.name}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger render={
                            <button
                              onClick={() => handleSelectList(summary.name)}
                              className={
                                'w-full cursor-pointer flex items-center justify-between gap-2 px-2 py-2 rounded-lg text-sm border border-transparent ' +
                                (selectedList === summary.name
                                  ? isLLMGenerated
                                    ? 'bg-blue-600/10 text-blue-700 font-medium border-blue-300'
                                    : 'bg-brand/10 text-brand font-medium border-brand/20'
                                  : isLLMGenerated
                                    ? 'text-blue-700 bg-blue-50/80 hover:bg-blue-100 hover:border-blue-300'
                                    : 'text-text-primary hover:bg-surface-1 hover:border-border')
                              }
                            />
                          }>
                            <span className="flex items-center gap-2 min-w-0">
                              {isLLMGenerated ? <Sparkles className="h-3.5 w-3.5 shrink-0" /> : <ListIcon className="h-3.5 w-3.5 shrink-0" />}
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
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            className={cn(
                              "max-w-xs flex-col items-start text-left leading-5",
                              isLLMGenerated && "border border-blue-500 bg-blue-700 text-white shadow-lg",
                            )}
                            arrowClassName={isLLMGenerated ? "bg-blue-700 fill-blue-700" : undefined}
                          >
                            <div className="font-semibold text-sm">{summary.name}</div>
                            {isLLMGenerated && <div className="text-[11px] font-bold uppercase tracking-wide text-blue-100">LLM generated list</div>}
                            <div>
                              Screen Associated: {summary.screen_name || getScreenDisplayName(screeningOptionsWithActive.find((screen) => screen.id === summary.screening_id)) || 'None'}
                            </div>
                            <div>Created: {formatTooltipDate(summary.created_at)}</div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                  </li>
                  );
                })}
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
                  <div className="text-xs text-text-tertiary flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{listCompanies.length.toLocaleString()} compan{listCompanies.length === 1 ? 'y' : 'ies'}</span>
                    <span>·</span>
                    <span>Screen Associated: <span className="font-medium text-text-primary">{selectedScreenAssociationLabel}</span></span>
                    {selectedKeys.size > 0 && (
                      <>
                        <span>·</span> <span className="text-brand font-medium">{selectedKeys.size} selected</span>
                      </>
                    )}
                  </div>
                  {promptGenerationError && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-danger/20 bg-danger/5 px-2 py-1 text-xs text-danger">
                      <span className="truncate">{promptGenerationError}</span>
                      <Button variant="outline" size="xs" onClick={handleRunLLMScreening} disabled={generatingPrompts}>
                        <RotateCcw className="mr-1 size-3" /> Try again
                      </Button>
                    </div>
                  )}
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
                  onClick={handleRunLLMScreening}
                  disabled={generatingPrompts}
                  title={listCompanies.length === 0 ? 'Add companies before running LLM screening' : undefined}
                  className="text-brand hover:bg-brand/10"
                >
                  {generatingPrompts ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
                  Run LLM Screening
                </Button>
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
              <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-surface-0/80 text-text-secondary">
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
                  getRowId={(p) => getCompanyKey(p.data) || `${p.data?.company || 'company'}-${p.data?.added_at || ''}`}
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
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (open) {
            setCreateAssociation('none');
            setCreateScreeningId('');
          }
        }}
      >
        <DialogContent showCloseButton className="!max-w-md !w-[420px]">
          <DialogHeader>
            <DialogTitle>Create new list</DialogTitle>
            <DialogDescription>Give the list a short name and choose whether it is associated with a screen.</DialogDescription>
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
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Screen association</label>
            <RadioGroup
              value={createAssociation}
              onValueChange={(value) => setCreateAssociation(value === 'associated' ? 'associated' : 'none')}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-surface-0 px-3 py-2 text-sm">
                <Radio.Root value="none" className="flex size-4 items-center justify-center rounded-full border border-border bg-surface-0 data-[checked]:border-brand">
                  <Radio.Indicator className="size-2 rounded-full bg-brand" />
                </Radio.Root>
                No Screen
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-surface-0 px-3 py-2 text-sm">
                <Radio.Root value="associated" className="flex size-4 items-center justify-center rounded-full border border-border bg-surface-0 data-[checked]:border-brand">
                  <Radio.Indicator className="size-2 rounded-full bg-brand" />
                </Radio.Root>
                Existing Screen
              </label>
            </RadioGroup>
            {createAssociation === 'associated' && (
              <Select value={createScreeningId} onValueChange={(value) => setCreateScreeningId(value || '')}>
                <SelectTrigger className="w-full h-9 bg-surface-0 items-center text-left">
                  <span className={cn('flex-1 truncate text-left', !createSelectedScreenLabel && 'text-muted-foreground')}>
                    {createSelectedScreenLabel || 'Choose an existing screen'}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {screeningOptionsWithActive.map((screen) => (
                    <SelectItem key={screen.id} value={screen.id}>
                      {getScreenDisplayName(screen)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim() || (createAssociation === 'associated' && !createScreeningId)}>
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
