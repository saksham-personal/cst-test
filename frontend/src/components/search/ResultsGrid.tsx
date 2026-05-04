import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ColDef,
  ColumnMenuTab,
  GridApi,
  IGetRowsParams,
  IDatasource,
  ModuleRegistry,
  AllCommunityModule,
  FilterChangedEvent,
  RowClickedEvent,
  SelectionChangedEvent,
  SortChangedEvent,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule, ClientSideRowModelModule]);

import { useViewStore } from '../../stores/viewStore';
import { useSearchStore } from '../../stores/searchStore';
import {
  ConnectionQualityCell,
  CurrencyCell,
  DescriptionCell,
  LinkCell,
  LongTextCell,
  MatchPctCell,
  MncFlagCell,
  ScoreCell,
} from '../common/GridCells';
import { SearchResultRow } from '../../api/types';
import { searchPage } from '../../api/endpoints';
import { Loader2, Search as SearchIcon } from 'lucide-react';

export interface ResultsGridColumnToggleItem {
  colId: string;
  label: string;
}

export interface ResultsGridColumnControls {
  items: ResultsGridColumnToggleItem[];
  visibility: Record<string, boolean>;
  toggleColumn: (colId: string, visible: boolean) => void;
  showAllColumns: () => void;
  resetColumns: () => void;
}

interface ResultsGridProps {
  onRowClick: (row: SearchResultRow) => void;
  searchId: string | null;
  initialResults: SearchResultRow[];
  totalCount: number;
  pageSize: number;
  isLoading: boolean;
  hasSearched: boolean;
  onColumnControlsChange?: (controls: ResultsGridColumnControls | null) => void;
  selectedOnlyView?: boolean;
}

const HEADER_CLASS = 'ag-premium-header';
const NUMERIC_CLASS = 'font-mono tabular-nums text-sm';

const DESCRIPTION_FIELDS = [
  'Company Description',
  'Pitchbook Description',
  'Factset Description',
  'Demandbase Description',
  'Salesforce Description',
  'Dealogic Description',
  'Offerings',
  'Pitchbook Keywords',
] as const;

const COLUMN_TOGGLE_ITEMS: ResultsGridColumnToggleItem[] = [
  { colId: 'primary_key_value', label: 'Crescendo ID' },
  { colId: 'ECID', label: 'ECID' },
  { colId: 'PBID', label: 'PBID' },
  { colId: 'company_name', label: 'Company' },
  { colId: 'Company Status', label: 'Company Status' },
  { colId: 'Annual Revenue', label: 'Annual Revenue' },
  { colId: 'Sales Range', label: 'Sales Range' },
  { colId: 'Sales Range Category', label: 'Sales Range Category' },
  { colId: 'NAICS Description', label: 'NAICS Description' },
  { colId: 'City', label: 'City' },
  { colId: 'Zip Code', label: 'Zip Code' },
  { colId: 'Website', label: 'Website' },
  { colId: 'Segment', label: 'Segment' },
  { colId: 'Region', label: 'Region' },
  { colId: 'Market', label: 'Market' },
  { colId: 'Banker Name', label: 'Banker Name' },
  { colId: 'R12 Call Count', label: 'R12 Call Count' },
  { colId: 'CB R12 Call Count', label: 'CB R12 Call Count' },
  { colId: 'IB R12 Call Count', label: 'IB R12 Call Count' },
  { colId: 'Last Call Date', label: 'Last Call Date' },
  { colId: 'CEO Connectivity Rating', label: 'CEO Connectivity Rating' },
  { colId: 'IB Sector', label: 'IB Sector' },
  { colId: 'IB Sub Sector', label: 'IB Sub Sector' },
  { colId: 'IB Sub Sector Level 2', label: 'IB Sub Sector Level 2' },
  { colId: 'IB Microsector', label: 'IB Microsector' },
  { colId: 'IB Client Executive', label: 'IB Client Executive' },
  { colId: 'Sponsors', label: 'Sponsors' },
  { colId: 'Sponsor Type', label: 'Sponsor Type' },
  { colId: 'Protocol Tier', label: 'Protocol Tier' },
  { colId: 'Description', label: 'Description' },
  { colId: 'Location of HQ', label: 'Location of HQ' },
  { colId: 'Pitchbook Ownership Status', label: 'Pitchbook Ownership Status' },
  { colId: 'LOB', label: 'LOB' },
  { colId: 'Sub LOB', label: 'Sub LOB' },
  { colId: 'Sub Sub LOB', label: 'Sub Sub LOB' },
  { colId: 'Sub Sub Sub LOB', label: 'Sub Sub Sub LOB' },
  { colId: 'Sub Sub Sub Sub LOB', label: 'Sub Sub Sub Sub LOB' },
  { colId: 'Sub Sub Sub Sub Sub LOB', label: 'Sub Sub Sub Sub Sub LOB' },
  { colId: 'Quality of connection', label: 'Quality of connection' },
  { colId: 'Quality Criteria', label: 'Quality Criteria' },
  { colId: 'Private Banker', label: 'Private Banker' },
  { colId: 'Private Bank Flag', label: 'Private Bank Flag' },
  { colId: 'High Potential Growth Signal', label: 'High Potential Growth Signal' },
  { colId: 'Sales Size Growth Signal', label: 'Sales Size Growth Signal' },
  { colId: 'Payroll Growth Signal', label: 'Payroll Growth Signal' },
  { colId: 'Deposits Growth Signal', label: 'Deposits Growth Signal' },
  { colId: 'International Payments Growth Signal', label: 'International Payments Growth Signal' },
  { colId: 'MNC Filter', label: 'MNC Filter' },
  { colId: 'completeness', label: 'Match %' },
  { colId: 'composite_score', label: 'Score' },
  { colId: 'keywords_matched', label: 'Keywords Hit' },
  { colId: 'matched_keywords', label: 'Matched Keywords' },
];

const DEFAULT_COLUMN_VISIBILITY = Object.fromEntries(
  COLUMN_TOGGLE_ITEMS.map((item) => [item.colId, [
    'company_name',
    'primary_key_value',
    'ECID',
    'completeness',
    'composite_score',
    'keywords_matched',
    'matched_keywords',
    'Description',
    'Website',
    'Location of HQ',
    'Banker Name',
    'Segment',
    'Annual Revenue',
    'Company Status',
    'NAICS Description',
    'CEO Connectivity Rating',
    'Sponsors',
    'Sponsor Type',
    'LOB',
    'Sub LOB',
    'Sub Sub LOB',
    'Sub Sub Sub LOB',
    'Sub Sub Sub Sub LOB',
    'Quality of connection',
    'Quality Criteria',
    'MNC Filter',
  ].includes(item.colId)]),
) as Record<string, boolean>;

function getMetadataValue(row: SearchResultRow | null | undefined, ...keys: string[]) {
  const metadata = row?.metadata || {};
  for (const key of keys) {
    if (metadata[key] != null && String(metadata[key]).trim() !== '') {
      return metadata[key];
    }
  }
  return null;
}

function getMetadataText(row: SearchResultRow | null | undefined, ...keys: string[]) {
  const value = getMetadataValue(row, ...keys);
  return value == null ? '' : String(value).trim();
}

function getMetadataNumber(row: SearchResultRow | null | undefined, ...keys: string[]) {
  const value = getMetadataValue(row, ...keys);
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const numeric = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function buildDescriptionValue(row: SearchResultRow | null | undefined) {
  return DESCRIPTION_FIELDS
    .map((field) => {
      const text = getMetadataText(row, field);
      return text ? `${field}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      '.ag-selection-checkbox, .ag-checkbox-input-wrapper, .ag-checkbox-input, [data-slot="checkbox"], a, button',
    ),
  );
}

export function ResultsGrid({
  onRowClick,
  searchId,
  initialResults,
  totalCount,
  pageSize,
  isLoading,
  hasSearched,
  onColumnControlsChange,
  selectedOnlyView = false,
}: ResultsGridProps) {
  const {
    columnState,
    columnVisibility: storedColumnVisibility,
    setColumnState,
    setColumnVisibility: setStoredColumnVisibility,
  } = useViewStore();
  const setSelectedRows = useSearchStore((s) => s.setSelectedRows);
  const selectedRows = useSearchStore((s) => s.selectedRows);
  const gridRef = useRef<AgGridReact>(null);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    () => storedColumnVisibility ?? { ...DEFAULT_COLUMN_VISIBILITY },
  );

  const sortModelRef = useRef<{ colId: string; sort: 'asc' | 'desc' }[]>([]);
  const filterModelRef = useRef<Record<string, any>>({});

  const columnDefs = useMemo<ColDef<SearchResultRow>[]>(() => {
    const textFilterParams = { buttons: ['reset', 'apply'], closeOnApply: true };
    const numberFilterParams = { buttons: ['reset', 'apply'], closeOnApply: true };

    const makeMetadataTextColumn = (
      colId: string,
      options?: {
        width?: number;
        minWidth?: number;
        flex?: number;
        longText?: boolean;
      },
    ): ColDef<SearchResultRow> => ({
      colId,
      headerName: colId,
      width: options?.width,
      minWidth: options?.minWidth,
      flex: options?.flex,
      hide: !DEFAULT_COLUMN_VISIBILITY[colId],
      headerClass: HEADER_CLASS,
      filter: 'agTextColumnFilter',
      filterParams: textFilterParams,
      valueGetter: (params) => getMetadataText(params.data, colId),
      cellRenderer: options?.longText
        ? (params: any) => <LongTextCell value={String(params.value || '')} />
        : undefined,
      tooltipValueGetter: (params) => String(params.value || ''),
    });

    return [
      {
        colId: '__selection__',
        headerName: '',
        checkboxSelection: true,
        headerCheckboxSelection: false,
        headerCheckboxSelectionFilteredOnly: false,
        pinned: 'left',
        width: 44,
        lockPosition: 'left',
        suppressMovable: true,
        sortable: false,
        resizable: false,
        filter: false,
      },
      {
        colId: 'company_name',
        field: 'company_name',
        headerName: 'Company',
        pinned: 'left',
        minWidth: 220,
        width: 260,
        flex: 1,
        hide: !DEFAULT_COLUMN_VISIBILITY.company_name,
        cellClass: 'font-semibold text-text-primary',
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => params.data?.company_name || params.data?.primary_key_value || '',
        tooltipValueGetter: (params) => params.data?.company_name || params.data?.primary_key_value || '',
      },
      {
        colId: 'Description',
        headerName: 'Description',
        width: 420,
        minWidth: 320,
        hide: !DEFAULT_COLUMN_VISIBILITY.Description,
        sortable: false,
        filter: false,
        headerClass: HEADER_CLASS,
        valueGetter: (params) => buildDescriptionValue(params.data),
        cellRenderer: (params: any) => <DescriptionCell value={String(params.value || '')} />,
      },
      {
        colId: 'primary_key_value',
        field: 'primary_key_value',
        headerName: 'Crescendo ID',
        width: 160,
        hide: !DEFAULT_COLUMN_VISIBILITY.primary_key_value,
        headerClass: HEADER_CLASS,
        cellClass: 'font-mono text-xs',
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => params.data?.primary_key_value || '',
      },
      {
        colId: 'ECID',
        headerName: 'ECID',
        width: 140,
        hide: !DEFAULT_COLUMN_VISIBILITY.ECID,
        headerClass: HEADER_CLASS,
        cellClass: 'font-mono text-xs',
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'ECID', 'Crescendo EID', 'ecid'),
      },
      {
        colId: 'completeness',
        field: 'completeness',
        headerName: 'Match %',
        width: 160,
        hide: !DEFAULT_COLUMN_VISIBILITY.completeness,
        cellRenderer: (params: any) => <MatchPctCell value={params.value} />,
        headerClass: HEADER_CLASS,
        filter: 'agNumberColumnFilter',
        filterParams: {
          numberParser: (text: string | null) => (text == null || text === '' ? null : Number(text) / 100),
          buttons: ['reset', 'apply'],
        },
        comparator: (a, b) => (a || 0) - (b || 0),
      },
      {
        colId: 'composite_score',
        field: 'composite_score',
        headerName: 'Score',
        width: 110,
        hide: !DEFAULT_COLUMN_VISIBILITY.composite_score,
        cellRenderer: (params: any) => <ScoreCell value={params.value} />,
        headerClass: HEADER_CLASS,
        filter: 'agNumberColumnFilter',
        filterParams: numberFilterParams,
        comparator: (a, b) => (a || 0) - (b || 0),
      },
      {
        colId: 'keywords_matched',
        field: 'keywords_matched',
        headerName: 'Keywords Hit',
        width: 140,
        hide: !DEFAULT_COLUMN_VISIBILITY.keywords_matched,
        valueGetter: (params) => params.data ? `${params.data.keywords_matched}/${params.data.n_keywords}` : '',
        cellClass: `text-center ${NUMERIC_CLASS}`,
        headerClass: `${HEADER_CLASS} ag-center-header`,
        filter: 'agNumberColumnFilter',
        filterParams: numberFilterParams,
        comparator: (_a, _b, nodeA, nodeB) => (nodeA.data?.keywords_matched || 0) - (nodeB.data?.keywords_matched || 0),
      },
      {
        colId: 'matched_keywords',
        headerName: 'Matched Keywords',
        width: 260,
        hide: !DEFAULT_COLUMN_VISIBILITY.matched_keywords,
        valueGetter: (params) => params.data?.matched_keywords?.join(', ') || '',
        cellRenderer: (params: any) => <LongTextCell value={String(params.value || '')} />,
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
      },
      {
        colId: 'PBID',
        headerName: 'PBID',
        width: 140,
        hide: !DEFAULT_COLUMN_VISIBILITY.PBID,
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'PBID'),
      },
      {
        colId: 'Company Status',
        headerName: 'Company Status',
        width: 160,
        hide: !DEFAULT_COLUMN_VISIBILITY['Company Status'],
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'Company Status', 'company_status'),
        cellRenderer: (params: any) => <LongTextCell value={String(params.value || '')} />,
      },
      {
        colId: 'Annual Revenue',
        headerName: 'Annual Revenue',
        width: 170,
        hide: !DEFAULT_COLUMN_VISIBILITY['Annual Revenue'],
        headerClass: HEADER_CLASS,
        filter: 'agNumberColumnFilter',
        filterParams: numberFilterParams,
        valueGetter: (params) => getMetadataNumber(params.data, 'Annual Revenue'),
        cellRenderer: (params: any) => <CurrencyCell value={params.value} />,
        comparator: (a, b) => (a || 0) - (b || 0),
      },
      makeMetadataTextColumn('Sales Range', { width: 170 }),
      makeMetadataTextColumn('Sales Range Category', { width: 190 }),
      makeMetadataTextColumn('NAICS Description', { width: 220, longText: true }),
      makeMetadataTextColumn('City', { width: 140 }),
      makeMetadataTextColumn('Zip Code', { width: 120 }),
      {
        colId: 'Website',
        headerName: 'Website',
        width: 230,
        hide: !DEFAULT_COLUMN_VISIBILITY.Website,
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'Website', 'open_website'),
        cellRenderer: (params: any) => <LinkCell value={String(params.value || '')} />,
      },
      makeMetadataTextColumn('Segment', { width: 150 }),
      makeMetadataTextColumn('Region', { width: 140 }),
      makeMetadataTextColumn('Market', { width: 180 }),
      makeMetadataTextColumn('Banker Name', { width: 190 }),
      makeMetadataTextColumn('R12 Call Count', { width: 150 }),
      makeMetadataTextColumn('CB R12 Call Count', { width: 170 }),
      makeMetadataTextColumn('IB R12 Call Count', { width: 170 }),
      makeMetadataTextColumn('Last Call Date', { width: 150 }),
      makeMetadataTextColumn('CEO Connectivity Rating', { width: 200 }),
      makeMetadataTextColumn('IB Sector', { width: 160 }),
      makeMetadataTextColumn('IB Sub Sector', { width: 180 }),
      makeMetadataTextColumn('IB Sub Sector Level 2', { width: 200 }),
      makeMetadataTextColumn('IB Microsector', { width: 180 }),
      makeMetadataTextColumn('IB Client Executive', { width: 180 }),
      makeMetadataTextColumn('Sponsors', { width: 180, longText: true }),
      makeMetadataTextColumn('Sponsor Type', { width: 160 }),
      makeMetadataTextColumn('Protocol Tier', { width: 150 }),
      makeMetadataTextColumn('Location of HQ', { width: 180, longText: true }),
      makeMetadataTextColumn('Pitchbook Ownership Status', { width: 210 }),
      makeMetadataTextColumn('LOB', { width: 150 }),
      makeMetadataTextColumn('Sub LOB', { width: 160 }),
      makeMetadataTextColumn('Sub Sub LOB', { width: 170 }),
      makeMetadataTextColumn('Sub Sub Sub LOB', { width: 190 }),
      makeMetadataTextColumn('Sub Sub Sub Sub LOB', { width: 210 }),
      makeMetadataTextColumn('Sub Sub Sub Sub Sub LOB', { width: 230 }),
      {
        colId: 'Quality of connection',
        headerName: 'Quality of connection',
        width: 210,
        hide: !DEFAULT_COLUMN_VISIBILITY['Quality of connection'],
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'Quality of connection'),
        cellRenderer: (params: any) => <ConnectionQualityCell value={String(params.value || '')} />,
      },
      makeMetadataTextColumn('Quality Criteria', { width: 220, longText: true }),
      makeMetadataTextColumn('Private Banker', { width: 180 }),
      makeMetadataTextColumn('Private Bank Flag', { width: 170 }),
      makeMetadataTextColumn('High Potential Growth Signal', { width: 220 }),
      makeMetadataTextColumn('Sales Size Growth Signal', { width: 220 }),
      makeMetadataTextColumn('Payroll Growth Signal', { width: 200 }),
      makeMetadataTextColumn('Deposits Growth Signal', { width: 210 }),
      makeMetadataTextColumn('International Payments Growth Signal', { width: 260 }),
      {
        colId: 'MNC Filter',
        headerName: 'MNC Filter',
        width: 130,
        hide: !DEFAULT_COLUMN_VISIBILITY['MNC Filter'],
        headerClass: HEADER_CLASS,
        filter: 'agTextColumnFilter',
        filterParams: textFilterParams,
        valueGetter: (params) => getMetadataText(params.data, 'MNC Filter'),
        cellRenderer: (params: any) => <MncFlagCell value={String(params.value || '')} />,
      },
    ];
  }, []);

  const dataSource: IDatasource = useMemo(() => ({
    getRows: async (params: IGetRowsParams) => {
      if (!searchId) {
        params.successCallback([], 0);
        return;
      }

      const startRow = params.startRow;
      const isInitialCall =
        startRow === 0
        && Object.keys(filterModelRef.current).length === 0
        && sortModelRef.current.length === 0;

      if (isInitialCall && initialResults.length > 0) {
        params.successCallback(initialResults, totalCount);
        return;
      }

      const page = Math.floor(startRow / pageSize) + 1;

      try {
        const response = await searchPage(searchId, {
          page,
          pageSize,
          includeHighlights: true,
          includeMetadata: true,
          filterModel: Object.keys(filterModelRef.current).length ? filterModelRef.current : null,
          sortModel: sortModelRef.current.length ? sortModelRef.current : null,
        });
        params.successCallback(response.results, response.total_count);
      } catch (err) {
        console.error('Failed to fetch search page:', err);
        params.failCallback();
      }
    },
  }), [searchId, initialResults, totalCount, pageSize]);

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.setGridOption('datasource', dataSource);
    }
  }, [dataSource]);

  const syncColumnState = useCallback((api?: GridApi<SearchResultRow> | null) => {
    const state = api?.getColumnState?.();
    if (!state) return;
    setColumnState(state.map((entry) => ({ ...entry, hide: false })));
  }, [setColumnState]);

  const onGridReady = useCallback((params: any) => {
    params.api.setGridOption?.('datasource', undefined);
    if (columnState && columnState.length > 0) {
      params.api.applyColumnState?.({
        state: columnState.map((entry) => ({ ...entry, hide: false })),
        applyOrder: true,
        defaultState: { hide: false },
      });
    }
    if (searchId && !selectedOnlyView) {
      params.api.setGridOption('datasource', dataSource);
    }
  }, [columnState, searchId, dataSource, selectedOnlyView]);

  const onColumnStateChanged = useCallback((e: any) => {
    syncColumnState(e.api);
  }, [syncColumnState]);

  const handleColumnVisibilityChange = useCallback((colId: string, visible: boolean) => {
    setColumnVisibility((current) => {
      const next = {
        ...current,
        [colId]: visible,
      };
      setStoredColumnVisibility(next);
      return next;
    });
  }, [setStoredColumnVisibility]);

  const handleShowAllColumns = useCallback(() => {
    const next = Object.fromEntries(COLUMN_TOGGLE_ITEMS.map((item) => [item.colId, true])) as Record<string, boolean>;
    setColumnVisibility(next);
    setStoredColumnVisibility(next);
  }, [setStoredColumnVisibility]);

  const handleResetColumns = useCallback(() => {
    const api = gridRef.current?.api;
    const next = { ...DEFAULT_COLUMN_VISIBILITY };
    setColumnVisibility(next);
    setStoredColumnVisibility(next);
    if (!api) return;
    api.resetColumnState();
  }, [setStoredColumnVisibility]);

  useEffect(() => {
    if (storedColumnVisibility) {
      setColumnVisibility(storedColumnVisibility);
    }
  }, [storedColumnVisibility]);

  const columnStateById = useMemo(
    () => new Map((columnState ?? []).map((entry, index) => [entry.colId, { ...entry, _index: index }])),
    [columnState],
  );

  const visibleColumnDefs = useMemo(
    () => [...columnDefs]
      .sort((a, b) => {
        const aId = String(a.colId ?? a.field ?? '');
        const bId = String(b.colId ?? b.field ?? '');
        const aOrder = columnStateById.get(aId)?._index ?? Number.MAX_SAFE_INTEGER;
        const bOrder = columnStateById.get(bId)?._index ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      })
      .filter((def) => {
        const colId = String(def.colId ?? def.field ?? '');
        if (colId === '__selection__') return true;
        return columnVisibility[colId] !== false;
      })
      .map((def) => {
        const colId = String(def.colId ?? def.field ?? '');
        const persisted = columnStateById.get(colId);
        return {
          ...def,
          width: persisted?.width ?? def.width,
          flex: persisted?.flex ?? def.flex,
          pinned: persisted?.pinned ?? def.pinned,
          hide: false,
        };
      }),
    [columnDefs, columnVisibility, columnStateById],
  );

  useEffect(() => {
    onColumnControlsChange?.({
      items: COLUMN_TOGGLE_ITEMS,
      visibility: columnVisibility,
      toggleColumn: handleColumnVisibilityChange,
      showAllColumns: handleShowAllColumns,
      resetColumns: handleResetColumns,
    });
  }, [
    columnVisibility,
    handleColumnVisibilityChange,
    handleShowAllColumns,
    handleResetColumns,
    onColumnControlsChange,
  ]);

  useEffect(() => () => onColumnControlsChange?.(null), [onColumnControlsChange]);

  const handleSelectionChanged = useCallback((e: SelectionChangedEvent<SearchResultRow>) => {
    const rows = e.api?.getSelectedRows?.() as SearchResultRow[] | undefined;
    setSelectedRows(rows || []);
  }, [setSelectedRows]);

  const handleSortChanged = useCallback((e: SortChangedEvent<SearchResultRow>) => {
    const cols = e.api.getColumnState() as Array<{ colId: string; sort?: 'asc' | 'desc' | null; sortIndex?: number | null }>;
    const active = cols
      .filter((c) => c.sort === 'asc' || c.sort === 'desc')
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map((c) => ({ colId: c.colId, sort: c.sort as 'asc' | 'desc' }));
    sortModelRef.current = active;
    e.api.purgeInfiniteCache();
  }, []);

  const handleFilterChanged = useCallback((e: FilterChangedEvent<SearchResultRow>) => {
    filterModelRef.current = e.api.getFilterModel() || {};
    e.api.purgeInfiniteCache();
  }, []);

  const handleRowClicked = useCallback((e: RowClickedEvent<SearchResultRow>) => {
    if (shouldIgnoreRowClick(e.event?.target ?? null)) return;
    if (e.data) onRowClick(e.data);
  }, [onRowClick]);

  const showEmpty = !selectedOnlyView && !isLoading && hasSearched && totalCount === 0;
  const showIdle = !selectedOnlyView && !isLoading && !hasSearched;
  const showSelectedOnlyEmpty = selectedOnlyView && selectedRows.length === 0;

  const commonGridProps = {
    ref: gridRef,
    columnDefs: visibleColumnDefs,
    rowHeight: 56,
    headerHeight: 44,
    onGridReady,
    onColumnMoved: onColumnStateChanged,
    onColumnResized: onColumnStateChanged,
    onColumnPinned: onColumnStateChanged,
    onColumnVisible: onColumnStateChanged,
    onSelectionChanged: handleSelectionChanged,
    onSortChanged: handleSortChanged,
    onFilterChanged: handleFilterChanged,
    onRowClicked: handleRowClicked,
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: true,
      filterParams: { buttons: ['reset', 'apply'], closeOnApply: true },
      suppressMovable: false,
      menuTabs: ['filterMenuTab' as ColumnMenuTab],
    },
    suppressNoRowsOverlay: true,
    rowSelection: 'multiple' as const,
    suppressRowClickSelection: true,
    rowClass: 'cursor-pointer hover:bg-surface-1',
    getRowId: (params: any) => params.data?.primary_key_value || String(params.data?.rowid),
  };

  return (
    <div className="ag-theme-quartz ag-premium-headers flex-1 w-full relative" data-selected-only-view={selectedOnlyView ? 'true' : 'false'}>
      {selectedOnlyView ? (
        <AgGridReact<SearchResultRow>
          key="selected-only-grid"
          {...commonGridProps}
          theme="legacy"
          rowModelType="clientSide"
          rowData={selectedRows}
          animateRows={false}
        />
      ) : (
        <AgGridReact<SearchResultRow>
          key="search-results-grid"
          {...commonGridProps}
          theme="legacy"
          rowModelType="infinite"
          cacheBlockSize={pageSize}
          infiniteInitialRowCount={totalCount || 0}
          maxBlocksInCache={10}
        />
      )}

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-0/80 pointer-events-none">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-0 border border-border shadow-md">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            <span className="text-sm font-medium text-text-primary">Searching…</span>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-text-tertiary">
            <SearchIcon className="h-8 w-8" />
            <span className="text-sm font-medium">No matches for these keywords.</span>
          </div>
        </div>
      )}

      {showIdle && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-text-tertiary">
            <SearchIcon className="h-8 w-8" />
            <span className="text-sm">Add keywords and press Search to see results.</span>
          </div>
        </div>
      )}

      {showSelectedOnlyEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-text-tertiary">
            <SearchIcon className="h-8 w-8" />
            <span className="text-sm">Select rows to show only the selected companies.</span>
          </div>
        </div>
      )}
    </div>
  );
}
