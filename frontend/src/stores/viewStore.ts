import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColumnState } from 'ag-grid-community';

interface ViewState {
  columnState: ColumnState[] | null;
  columnVisibility: Record<string, boolean> | null;
  rowHeights: Record<string, Record<number, number>>; // searchId -> rowIdx -> height
  
  setColumnState: (state: ColumnState[]) => void;
  setColumnVisibility: (state: Record<string, boolean> | null) => void;
  setRowHeight: (searchId: string, rowIdx: number, height: number) => void;
  
  resetColumns: () => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      columnState: null,
      columnVisibility: null,
      rowHeights: {},

      setColumnState: (state) => set({ columnState: state }),

      setColumnVisibility: (state) => set({ columnVisibility: state }),

      setRowHeight: (searchId, rowIdx, height) => set((state) => {
        const currentSearch = state.rowHeights[searchId] || {};
        return {
          rowHeights: {
            ...state.rowHeights,
            [searchId]: {
              ...currentSearch,
              [rowIdx]: height
            }
          }
        };
      }),

      resetColumns: () => set({
        columnState: null,
        columnVisibility: null,
      })
    }),
    {
      name: 'company-screener-views',
      version: 5,
      migrate: (persistedState: any) => ({
        ...persistedState,
        columnState: null,
        columnVisibility: null,
      }),
    }
  )
);
