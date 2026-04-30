import { useCallback, useEffect, useState } from 'react';
import type { VisibilityState, ColumnPinningState, ColumnOrderState, ColumnSizingState } from '@tanstack/react-table';

const STORAGE_KEY_ORDER = 'company-screener-column-order';
const STORAGE_KEY_VISIBILITY = 'company-screener-column-visibility';
const STORAGE_KEY_PINNING = 'company-screener-column-pinning';
const STORAGE_KEY_SIZING = 'company-screener-column-sizing';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch { /* ignore */ }
  return fallback;
}

export function useColumnState(columnKeys: string[]) {
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    () => loadFromStorage(STORAGE_KEY_ORDER, columnKeys)
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => loadFromStorage(STORAGE_KEY_VISIBILITY, {})
  );
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(
    () => loadFromStorage(STORAGE_KEY_PINNING, { left: ['crescendo_id', 'company_name'], right: [] })
  );
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(
    () => loadFromStorage(STORAGE_KEY_SIZING, {})
  );

  // If columnKeys changed and order is stale, update
  useEffect(() => {
    const missing = columnKeys.filter((k) => !columnOrder.includes(k));
    const extras = columnOrder.filter((k) => !columnKeys.includes(k));
    if (missing.length > 0 || extras.length > 0) {
      // Rebuild order: keep existing keys in order, append new ones
      const known = columnOrder.filter((k) => columnKeys.includes(k));
      const newOnes = columnKeys.filter((k) => !known.includes(k));
      setColumnOrder([...known, ...newOnes]);
    }
  }, [columnKeys]);

  const updateOrder = useCallback((updater: ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState)) => {
    const next = typeof updater === 'function' ? updater(columnOrder) : updater;
    setColumnOrder(next);
    try { localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(next)); } catch { /* ignore */ }
  }, [columnOrder]);

  const updateVisibility = useCallback((updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
    setColumnVisibility(next);
    try { localStorage.setItem(STORAGE_KEY_VISIBILITY, JSON.stringify(next)); } catch { /* ignore */ }
  }, [columnVisibility]);

  const updatePinning = useCallback((updater: ColumnPinningState | ((prev: ColumnPinningState) => ColumnPinningState)) => {
    const next = typeof updater === 'function' ? updater(columnPinning) : updater;
    setColumnPinning(next);
    try { localStorage.setItem(STORAGE_KEY_PINNING, JSON.stringify(next)); } catch { /* ignore */ }
  }, [columnPinning]);

  const updateSizing = useCallback((updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
    const next = typeof updater === 'function' ? updater(columnSizing) : updater;
    setColumnSizing(next);
    try { localStorage.setItem(STORAGE_KEY_SIZING, JSON.stringify(next)); } catch { /* ignore */ }
  }, [columnSizing]);

  const resetToDefault = useCallback(() => {
    setColumnOrder(columnKeys);
    setColumnVisibility({});
    setColumnPinning({ left: ['crescendo_id', 'company_name'], right: [] });
    setColumnSizing({});
    try {
      localStorage.removeItem(STORAGE_KEY_ORDER);
      localStorage.removeItem(STORAGE_KEY_VISIBILITY);
      localStorage.removeItem(STORAGE_KEY_PINNING);
      localStorage.removeItem(STORAGE_KEY_SIZING);
    } catch { /* ignore */ }
  }, [columnKeys]);

  return {
    columnOrder,
    setColumnOrder: updateOrder,
    columnVisibility,
    setColumnVisibility: updateVisibility,
    columnPinning,
    setColumnPinning: updatePinning,
    columnSizing,
    setColumnSizing: updateSizing,
    resetToDefault,
  };
}
