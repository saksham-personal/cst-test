import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColumnState } from 'ag-grid-community';
import type { Keyword } from './searchStore';

export interface ViewSnapshot {
  columnState: ColumnState[] | null;
  rowHeights: Record<number, number>; // per-row heights specific to this view snapshot
  quickFilterText: string;
}

export interface SavedView {
  id: string;
  name: string;
  scope: 'search' | 'lists';
  snapshot: ViewSnapshot;
  includesQuery: boolean;
  queryState?: {
    keywords: Keyword[];
    expression: string;
  };
  createdAt: number;
}

interface SavedViewsState {
  views: SavedView[];
  saveView: (view: Omit<SavedView, 'id' | 'createdAt'>) => void;
  updateView: (id: string, updates: Partial<SavedView>) => void;
  deleteView: (id: string) => void;
}

export const useSavedViewsStore = create<SavedViewsState>()(
  persist(
    (set) => ({
      views: [],

      saveView: (viewData) => set((state) => ({
        views: [
          ...state.views,
          {
            ...viewData,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
          }
        ]
      })),

      updateView: (id, updates) => set((state) => ({
        views: state.views.map((v) => v.id === id ? { ...v, ...updates } : v)
      })),

      deleteView: (id) => set((state) => ({
        views: state.views.filter((v) => v.id !== id)
      })),
    }),
    {
      name: 'company-screener-saved-views',
    }
  )
);
