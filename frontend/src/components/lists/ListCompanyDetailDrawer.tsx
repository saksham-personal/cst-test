import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '../ui/sheet';
import { normalizeWebsiteUrl } from '../common/GridCells';
import { getWebsiteDisplayValue } from '../common/GridCells';
import type { ListCompanyDetail } from '../../api/endpoints';
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  useUiStore,
} from '../../stores/uiStore';

interface ListCompanyDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  company: ListCompanyDetail | null;
  isLoading?: boolean;
}

const clampWidth = (width: number) =>
  Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(width)));

function formatAdded(raw?: string): string {
  if (!raw) return '—';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return raw;
  }
}

export function ListCompanyDetailDrawer({
  isOpen,
  onClose,
  company,
  isLoading = false,
}: ListCompanyDetailDrawerProps) {
  const drawerWidth = useUiStore((state) => state.drawerWidth);
  const setDrawerWidth = useUiStore((state) => state.setDrawerWidth);
  const [isResizing, setIsResizing] = useState(false);

  const popupRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const liveWidthRef = useRef<number>(drawerWidth);

  useEffect(() => {
    if (!isResizing) liveWidthRef.current = drawerWidth;
  }, [drawerWidth, isResizing]);

  const onMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startRef.current = { x: event.clientX, w: liveWidthRef.current };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: MouseEvent) => {
      if (!startRef.current || !popupRef.current) return;
      const delta = startRef.current.x - event.clientX;
      const next = clampWidth(startRef.current.w + delta);
      liveWidthRef.current = next;
      popupRef.current.style.width = `${next}px`;
    };

    const onUp = () => {
      startRef.current = null;
      setIsResizing(false);
      setDrawerWidth(liveWidthRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [isResizing, setDrawerWidth]);

  if (!company && !isLoading) return null;

  const metadata = company?.metadata || {};
  const rawWebsite = ((metadata['Website'] as string) || (metadata['open_website'] as string) || '').trim();
  const websiteLabel = getWebsiteDisplayValue(rawWebsite);
  const websiteUrl = normalizeWebsiteUrl(rawWebsite);
  const detailEntries = Object.entries(metadata).filter(([key, value]) => (
    !['Website', 'open_website'].includes(key)
    && value != null
    && String(value).trim() !== ''
  ));
  const hasMetadata = detailEntries.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        ref={popupRef as any}
        showCloseButton={false}
        className="!max-w-none sm:!max-w-none !p-0 overflow-hidden border-l-border bg-surface-0 shadow-xl"
        style={{
          width: `${drawerWidth}px`,
          maxWidth: `min(${DRAWER_MAX_WIDTH}px, 95vw)`,
          transitionProperty: 'opacity, transform',
        }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize • Double-click to reset"
          onMouseDown={onMouseDown}
          onDoubleClick={() => {
            liveWidthRef.current = DRAWER_DEFAULT_WIDTH;
            setDrawerWidth(DRAWER_DEFAULT_WIDTH);
          }}
          className={
            'group absolute top-0 left-0 h-full w-2.5 cursor-col-resize z-30 flex items-center justify-center select-none ' +
            (isResizing ? 'bg-brand/15' : 'hover:bg-brand/10')
          }
          style={{ marginLeft: '-5px' }}
        >
          <div
            className={
              'w-[3px] h-16 rounded-full transition-colors ' +
              (isResizing ? 'bg-brand' : 'bg-border group-hover:bg-brand')
            }
          />
        </div>

        <div className="flex h-full flex-col overflow-hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface-0 px-6 py-4">
            <SheetTitle className="flex min-w-0 items-center gap-3 text-xl font-bold">
              <span className="truncate">
                {company?.company || company?.primary_key_value || company?.crescendo_id || 'Company details'}
              </span>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
            </SheetTitle>
            <div className="flex items-center gap-1 shrink-0">
              <SheetClose
                render={<Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-danger" />}
              >
                <X className="h-4 w-4" />
              </SheetClose>
            </div>
          </div>

          <div className="relative flex-1 overflow-y-auto">
            {isLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-0/75 backdrop-blur-[1px]">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-0 px-4 py-3 shadow-md">
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  <span className="text-sm font-medium text-text-primary">Loading company details…</span>
                </div>
              </div>
            )}

            <div className={'space-y-8 p-6 ' + (isLoading ? 'pointer-events-none opacity-50' : '')}>
              <div className="flex items-stretch gap-4 text-sm font-medium text-text-primary">
                <div className="flex flex-col">
                  <span className="text-xs text-text-tertiary">Crescendo ID</span>
                  <span className="font-mono tabular-nums">
                    {company?.primary_key_value || company?.crescendo_id || '—'}
                  </span>
                </div>
                <div className="w-px bg-border" />
                <div className="flex flex-col">
                  <span className="text-xs text-text-tertiary">Added to List</span>
                  <span>{formatAdded(company?.added_at)}</span>
                </div>
                {websiteUrl && (
                  <>
                    <div className="w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="text-xs text-text-tertiary">Website</span>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-[200px] truncate text-sm text-brand hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {websiteLabel}
                      </a>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-text-tertiary">
                  <span className="h-px flex-1 bg-border" />
                  List Details
                  <span className="h-px flex-1 bg-border" />
                </h3>
                <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-text-secondary">Company</span>
                  <span className="break-words">{company?.company || '—'}</span>

                  <span className="text-text-secondary">Crescendo ID</span>
                  <span className="font-mono tabular-nums break-all">
                    {company?.primary_key_value || company?.crescendo_id || '—'}
                  </span>

                  <span className="text-text-secondary">Added</span>
                  <span>{formatAdded(company?.added_at)}</span>

                  <span className="text-text-secondary">Source Keywords</span>
                  <span className="break-words">
                    {company?.source_keywords && company.source_keywords.length > 0
                      ? company.source_keywords.join(', ')
                      : '—'}
                  </span>
                </div>
              </div>

              {company?.source_keywords && company.source_keywords.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-text-tertiary">
                    <span className="h-px flex-1 bg-border" />
                    Source Keywords
                    <span className="h-px flex-1 bg-border" />
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {company.source_keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-text-tertiary">
                  <span className="h-px flex-1 bg-border" />
                  Company Details
                  <span className="h-px flex-1 bg-border" />
                </h3>

                {hasMetadata ? (
                  <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {detailEntries.map(([key, value]) => (
                      (
                        <Fragment key={key}>
                          <span className="text-text-secondary" title={key}>{key}</span>
                          <span className="break-words">{String(value)}</span>
                        </Fragment>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-surface-1 px-4 py-3 text-sm text-text-tertiary">
                    Company metadata is unavailable for this saved list entry.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <span className="sr-only">Min width: {DRAWER_MIN_WIDTH}px</span>
      </SheetContent>
    </Sheet>
  );
}
