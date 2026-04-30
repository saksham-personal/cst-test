import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SEARCH_SHORTCUT_LIST, type SearchShortcutDefinition } from '../config/searchShortcuts';

interface PendingShortcut {
  shortcut: SearchShortcutDefinition;
  digits: string;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

function normalizeKey(key: string) {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function shortcutMatches(event: KeyboardEvent, combo: string) {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const expectsAlt = parts.includes('Alt');
  const expectsCtrl = parts.includes('Ctrl');
  const expectsMeta = parts.includes('Meta');
  const expectsShift = parts.includes('Shift');

  return (
    event.altKey === expectsAlt
    && event.ctrlKey === expectsCtrl
    && event.metaKey === expectsMeta
    && event.shiftKey === expectsShift
    && normalizeKey(event.key) === key
  );
}

function findShortcutElement(target: string, index?: number) {
  const selector = index == null
    ? `[data-shortcut-target="${target}"]`
    : `[data-shortcut-target="${target}"][data-shortcut-index="${index}"]`;
  return document.querySelector<HTMLElement>(selector);
}

function focusShortcutElement(target: string, index?: number) {
  const element = findShortcutElement(target, index);
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.focus();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.select();
  }
  return true;
}

function clickShortcutElement(target: string, index?: number) {
  const element = findShortcutElement(target, index);
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.click();
  return true;
}

export function useSearchShortcuts() {
  const [pendingShortcut, setPendingShortcut] = useState<PendingShortcut | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (pendingShortcut) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setPendingShortcut(null);
          toast.dismiss('search-shortcut-pending');
          return;
        }

        if (/^[0-9]$/.test(event.key)) {
          event.preventDefault();
          const nextDigits = `${pendingShortcut.digits}${event.key}`;
          setPendingShortcut({ ...pendingShortcut, digits: nextDigits });
          toast.info(
            `${pendingShortcut.shortcut.description}: ${nextDigits}`,
            { id: 'search-shortcut-pending' },
          );
          return;
        }

        if (event.key === 'Backspace') {
          event.preventDefault();
          const nextDigits = pendingShortcut.digits.slice(0, -1);
          if (!nextDigits) {
            setPendingShortcut({ ...pendingShortcut, digits: '' });
            toast.info(
              `${pendingShortcut.shortcut.description}: type keyword row number, then Enter`,
              { id: 'search-shortcut-pending' },
            );
          } else {
            setPendingShortcut({ ...pendingShortcut, digits: nextDigits });
            toast.info(`${pendingShortcut.shortcut.description}: ${nextDigits}`, { id: 'search-shortcut-pending' });
          }
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          const index = Number(pendingShortcut.digits);
          if (!Number.isFinite(index) || index < 1) {
            toast.error('Enter a keyword row number before pressing Enter.', { id: 'search-shortcut-pending' });
            return;
          }

          const target = pendingShortcut.shortcut.target;
          const success = target?.includes('remove')
            ? clickShortcutElement(target, index)
            : focusShortcutElement(target || '', index);

          if (!success) {
            toast.error(`Keyword row ${index} was not found.`, { id: 'search-shortcut-pending' });
          } else {
            toast.dismiss('search-shortcut-pending');
          }
          setPendingShortcut(null);
          return;
        }

        return;
      }

      const matched = SEARCH_SHORTCUT_LIST.find((shortcut) => shortcutMatches(event, shortcut.combo));
      if (!matched) return;

      if (isEditableTarget(event.target) || matched.combo.includes('Alt')) {
        event.preventDefault();
      }

      if (matched.mode === 'prompt') {
        setPendingShortcut({ shortcut: matched, digits: '' });
        toast.info(
          `${matched.description}: type keyword row number, then Enter`,
          { id: 'search-shortcut-pending' },
        );
        return;
      }

      if (!matched.target) return;
      const success = matched.target.includes('search') || matched.target.includes('add') || matched.target.includes('export') || matched.target.includes('import') || matched.target.includes('select')
        ? clickShortcutElement(matched.target)
        : focusShortcutElement(matched.target);

      if (!success) {
        toast.error(`Shortcut target unavailable: ${matched.description}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      toast.dismiss('search-shortcut-pending');
    };
  }, [pendingShortcut]);
}
