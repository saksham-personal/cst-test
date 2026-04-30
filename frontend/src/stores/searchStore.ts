import { create } from 'zustand';
import type { SearchPageResponse, SearchResultRow } from '../api/types';

export type KeywordAction = 'include' | 'exclude';
export type KeywordMode = 'lexical' | 'semantic';

export interface Keyword {
  id: string;
  keyword: string;
  mode: KeywordMode;
  action: KeywordAction;
  weight: number;
  /**
   * Optional custom serial number. When set, overrides the positional serial
   * used for boolean query expressions (e.g. "(1 AND 2) OR 3"). Falls back to
   * `index + 1` when undefined.
   */
  serial?: number;
}

interface SearchState {
  keywords: Keyword[];
  queryExpression: string;
  isDirty: boolean;

  // Last search result (cached for consumers that don't hold their own copy)
  lastResult: SearchPageResponse | null;
  // keyword text -> hit count, pulled out for convenience
  keywordHitCounts: Record<string, number>;
  // Row-selection state shared between grid and toolbar (keyed by primary_key_value)
  selectedRows: SearchResultRow[];
  // When true, "Add to List" should add every row in the current search by
  // searchId, not just the rows currently visible/selected in the grid.
  selectAllResults: boolean;
  selectedOnlyView: boolean;

  // Keyword actions
  addKeyword: (keyword: Omit<Keyword, 'id'>) => void;
  updateKeyword: (id: string, updates: Partial<Keyword>) => void;
  removeKeyword: (id: string) => void;
  setKeywords: (keywords: Keyword[]) => void;
  setQueryExpression: (expression: string) => void;
  markClean: () => void;
  clearAll: () => void;

  // Result / selection actions
  setLastResult: (result: SearchPageResponse | null) => void;
  setSelectedRows: (rows: SearchResultRow[]) => void;
  setSelectAllResults: (enabled: boolean) => void;
  setSelectedOnlyView: (enabled: boolean) => void;
}

const createEmptyKeyword = (): Keyword => ({
  id: crypto.randomUUID(),
  keyword: '',
  mode: 'lexical',
  action: 'include',
  weight: 1,
});

export const useSearchStore = create<SearchState>((set) => ({
  keywords: [createEmptyKeyword()],
  queryExpression: '',
  isDirty: false,
  lastResult: null,
  keywordHitCounts: {},
  selectedRows: [],
  selectAllResults: false,
  selectedOnlyView: false,

  addKeyword: (kw) => set((state) => ({
    keywords: [...state.keywords, { ...kw, id: crypto.randomUUID() }],
    isDirty: true,
  })),

  updateKeyword: (id, updates) => set((state) => ({
    keywords: state.keywords.map((k) => k.id === id ? { ...k, ...updates } : k),
    isDirty: true,
  })),

  removeKeyword: (id) => set((state) => {
    const next = state.keywords.filter((k) => k.id !== id);
    return {
      keywords: next.length > 0 ? next : [createEmptyKeyword()],
      isDirty: true,
    };
  }),

  setKeywords: (keywords) => set({
    keywords: keywords.length > 0 ? keywords : [createEmptyKeyword()],
    isDirty: true,
  }),

  setQueryExpression: (expr) => set({ queryExpression: expr, isDirty: true }),

  markClean: () => set({ isDirty: false }),

  clearAll: () => set({
    keywords: [createEmptyKeyword()],
    queryExpression: '',
    isDirty: true,
    lastResult: null,
    keywordHitCounts: {},
    selectedRows: [],
    selectAllResults: false,
    selectedOnlyView: false,
  }),

  setLastResult: (result) => set({
    lastResult: result,
    keywordHitCounts: result?.keyword_hit_counts ?? {},
    selectedRows: [],
    selectAllResults: false,
    selectedOnlyView: false,
  }),

  setSelectedRows: (rows) => set((state) => ({
    selectedRows: rows,
    // Explicit row selection overrides the "all results" mode.
    selectAllResults: rows.length > 0 ? false : state.selectAllResults,
  })),

  setSelectAllResults: (enabled) => set({ selectAllResults: enabled }),
  setSelectedOnlyView: (enabled) => set({ selectedOnlyView: enabled }),
}));
