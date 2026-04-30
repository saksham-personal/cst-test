export type SearchShortcutId =
  | 'focusKeywordSerial'
  | 'focusKeywordText'
  | 'focusKeywordWeight'
  | 'removeKeyword'
  | 'addKeyword'
  | 'openImport'
  | 'focusQuery'
  | 'executeSearch'
  | 'selectAllResults'
  | 'openExport'
  | 'addToList';

export interface SearchShortcutDefinition {
  id: SearchShortcutId;
  combo: string;
  description: string;
  mode: 'direct' | 'prompt';
  target?: string;
}

// Edit shortcut combos here to customize keyboard navigation across the search UI.
export const SEARCH_SHORTCUTS: Record<SearchShortcutId, SearchShortcutDefinition> = {
  focusKeywordSerial: {
    id: 'focusKeywordSerial',
    combo: 'Alt+N',
    description: 'Focus keyword serial by row number',
    mode: 'prompt',
    target: 'keyword-serial',
  },
  focusKeywordText: {
    id: 'focusKeywordText',
    combo: 'Alt+K',
    description: 'Focus keyword text by row number',
    mode: 'prompt',
    target: 'keyword-text',
  },
  focusKeywordWeight: {
    id: 'focusKeywordWeight',
    combo: 'Alt+W',
    description: 'Focus keyword weight by row number',
    mode: 'prompt',
    target: 'keyword-weight',
  },
  removeKeyword: {
    id: 'removeKeyword',
    combo: 'Alt+R',
    description: 'Remove keyword by row number',
    mode: 'prompt',
    target: 'keyword-remove',
  },
  addKeyword: {
    id: 'addKeyword',
    combo: 'Alt+A',
    description: 'Add a keyword row',
    mode: 'direct',
    target: 'keyword-add',
  },
  openImport: {
    id: 'openImport',
    combo: 'Alt+I',
    description: 'Open import keywords dialog',
    mode: 'direct',
    target: 'keyword-import',
  },
  focusQuery: {
    id: 'focusQuery',
    combo: 'Alt+Q',
    description: 'Focus the boolean query input',
    mode: 'direct',
    target: 'query-input',
  },
  executeSearch: {
    id: 'executeSearch',
    combo: 'Alt+Enter',
    description: 'Execute search',
    mode: 'direct',
    target: 'execute-search',
  },
  selectAllResults: {
    id: 'selectAllResults',
    combo: 'Alt+S',
    description: 'Toggle select all results',
    mode: 'direct',
    target: 'results-select-all',
  },
  openExport: {
    id: 'openExport',
    combo: 'Alt+Shift+E',
    description: 'Open export dialog',
    mode: 'direct',
    target: 'results-export',
  },
  addToList: {
    id: 'addToList',
    combo: 'Alt+Shift+L',
    description: 'Open add to list dialog',
    mode: 'direct',
    target: 'results-add-to-list',
  },
};

export const SEARCH_SHORTCUT_LIST = Object.values(SEARCH_SHORTCUTS);
