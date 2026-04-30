import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DRAWER_MIN_WIDTH = 360;
export const DRAWER_MAX_WIDTH = 1100;
export const DRAWER_DEFAULT_WIDTH = 520;

interface UiState {
  sidebarCollapsed: boolean;
  drawerWidth: number;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDrawerWidth: (width: number) => void;
}

const clampDrawer = (w: number) =>
  Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(w)));

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      drawerWidth: DRAWER_DEFAULT_WIDTH,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setDrawerWidth: (width) => set({ drawerWidth: clampDrawer(width) }),
    }),
    {
      name: 'company-screener-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        drawerWidth: state.drawerWidth,
      }),
    }
  )
);
