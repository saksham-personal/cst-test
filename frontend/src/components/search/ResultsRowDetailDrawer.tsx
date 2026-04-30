import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetClose } from '../ui/sheet';
import { Button } from '../ui/button';
import { Plus, X } from 'lucide-react';
import { SearchResultRow } from '../../api/types';
import { MarkedSnippet, MatchPctBadge, getWebsiteDisplayValue, normalizeWebsiteUrl } from '../common/GridCells';
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  useUiStore,
} from '../../stores/uiStore';

interface RowDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  row: SearchResultRow | null;
  onAddToList?: (row: SearchResultRow) => void;
}

const clampWidth = (w: number) =>
  Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(w)));

function getMetadataValue(row: SearchResultRow | null, ...keys: string[]) {
  const metadata = row?.metadata || {};
  for (const key of keys) {
    const value = metadata[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

function getMetadataText(row: SearchResultRow | null, ...keys: string[]) {
  const value = getMetadataValue(row, ...keys);
  return value == null ? '' : String(value).trim();
}

function formatRevenueMillions(value: unknown) {
  if (value == null || String(value).trim() === '') return '';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''));
  if (!Number.isFinite(numeric)) return String(value);
  return `$${(numeric / 1_000_000).toFixed(2)} mm`;
}

export function ResultsRowDetailDrawer({ isOpen, onClose, row, onAddToList }: RowDetailDrawerProps) {
  const drawerWidth = useUiStore((s) => s.drawerWidth);
  const setDrawerWidth = useUiStore((s) => s.setDrawerWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Ref to the popup element — we mutate its style directly during drag
  // so we bypass React re-render and Zustand/persist churn (60fps writes
  // to localStorage would otherwise jank the drag).
  const popupRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const liveWidthRef = useRef<number>(drawerWidth);

  // Keep liveWidthRef in sync with store when not dragging (e.g. double-click reset)
  useEffect(() => {
    if (!isResizing) liveWidthRef.current = drawerWidth;
  }, [drawerWidth, isResizing]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { x: e.clientX, w: liveWidthRef.current };
      setIsResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      if (!startRef.current || !popupRef.current) return;
      // Dragging left (decreasing clientX) should grow a right-anchored drawer.
      const delta = startRef.current.x - e.clientX;
      const next = clampWidth(startRef.current.w + delta);
      liveWidthRef.current = next;
      // Direct DOM write — no React render, no Zustand set, no localStorage write.
      popupRef.current.style.width = `${next}px`;
    };
    const onUp = () => {
      startRef.current = null;
      setIsResizing(false);
      // Commit the final width to the store exactly once.
      setDrawerWidth(liveWidthRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing, setDrawerWidth]);

  if (!row) return null;

  const meta = row.metadata || {};
  const rawWebsite = ((meta['Website'] as string) || (meta['open_website'] as string) || '').trim();
  const websiteLabel = getWebsiteDisplayValue(rawWebsite);
  const websiteUrl = normalizeWebsiteUrl(rawWebsite);
  const summaryItems = [
    { label: 'Crescendo ID', value: row.primary_key_value || '' },
    { label: 'ECID', value: getMetadataText(row, 'ECID', 'Crescendo EID', 'ecid') },
    { label: 'PBID', value: getMetadataText(row, 'PBID') },
    { label: 'Annual Revenue ($ mm)', value: formatRevenueMillions(getMetadataValue(row, 'Annual Revenue')) },
    { label: 'Website', value: websiteLabel, href: websiteUrl },
    { label: 'MNC Filter', value: getMetadataText(row, 'MNC Filter') },
  ];
  const companyDetails = [
    { label: 'Company', value: row.company_name || '' },
    { label: 'Company Status', value: getMetadataText(row, 'Company Status', 'company_status') },
    { label: 'Banker Name', value: getMetadataText(row, 'Banker Name', 'banker_name') },
    { label: 'Location of HQ', value: getMetadataText(row, 'Location of HQ') },
    { label: 'Zip Code', value: getMetadataText(row, 'Zip Code') },
    { label: 'Segment', value: getMetadataText(row, 'Segment') },
    { label: 'LOB', value: getMetadataText(row, 'LOB') },
    { label: 'Sub LOB', value: getMetadataText(row, 'Sub LOB') },
    { label: 'Sub Sub LOB', value: getMetadataText(row, 'Sub Sub LOB') },
    { label: 'Sub Sub Sub LOB', value: getMetadataText(row, 'Sub Sub Sub LOB') },
    { label: 'Sub Sub Sub Sub LOB', value: getMetadataText(row, 'Sub Sub Sub Sub LOB') },
    { label: 'Sub Sub Sub Sub Sub LOB', value: getMetadataText(row, 'Sub Sub Sub Sub Sub LOB') },
    { label: 'Quality of connection', value: getMetadataText(row, 'Quality of connection') },
    { label: 'Sponsors', value: getMetadataText(row, 'Sponsors') },
    { label: 'Sponsors Type', value: getMetadataText(row, 'Sponsor Type', 'Sponsors Type') },
  ];
  const descriptionEntries = [
    { label: 'Company Description', value: getMetadataText(row, 'Company Description') },
    { label: 'Pitchbook Description', value: getMetadataText(row, 'Pitchbook Description') },
    { label: 'Factset Description', value: getMetadataText(row, 'Factset Description') },
    { label: 'Demandbase Description', value: getMetadataText(row, 'Demandbase Description') },
    { label: 'Salesforce Description', value: getMetadataText(row, 'Salesforce Description') },
    { label: 'Dealogic Description', value: getMetadataText(row, 'Dealogic Description') },
    { label: 'Offerings', value: getMetadataText(row, 'Offerings') },
    { label: 'Pitchbook Keywords', value: getMetadataText(row, 'Pitchbook Keywords') },
  ].filter((entry) => entry.value);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        ref={popupRef as any}
        showCloseButton={false}
        // NOTE: Do NOT use `!w-auto` here — it's `width: auto !important` which
        // beats the inline `style={{ width }}` below. We override max-width (which
        // the sheet caps at `sm:max-w-sm`) and let the inline width win over the
        // attribute-selector `data-[side=right]:w-3/4` default.
        className="!max-w-none sm:!max-w-none !p-0 overflow-hidden border-l-border bg-surface-0 shadow-xl"
        style={{
          width: `${drawerWidth}px`,
          maxWidth: `min(${DRAWER_MAX_WIDTH}px, 95vw)`,
          // Kill any width transitions that might animate the drag.
          transitionProperty: 'opacity, transform',
        }}
      >
        {/* Resize handle — 10px hit area, 2px visible line that turns brand on hover/drag */}
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

        <div className="flex flex-col h-full overflow-hidden">
          <div className="sticky top-0 z-10 bg-surface-0 px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <SheetTitle className="text-xl font-bold flex items-center gap-3 min-w-0">
              <span className="truncate">{row.company_name || row.primary_key_value}</span>
              <MatchPctBadge value={row.completeness || 0} />
            </SheetTitle>
            <div className="flex items-center gap-1 shrink-0">
              {onAddToList && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-text-secondary hover:text-brand"
                  onClick={() => onAddToList(row)}
                  title="Add this company to a list"
                >
                  <Plus className="h-4 w-4" /> List
                </Button>
              )}
              <SheetClose
                render={<Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-danger" />}
              >
                <X className="h-4 w-4" />
              </SheetClose>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-surface-1 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{item.label}</div>
                  <div className="mt-1 min-h-[22px] break-words text-sm font-medium text-text-primary">
                    {item.href && item.value ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-brand hover:underline"
                      >
                        {item.value}
                      </a>
                    ) : (
                      item.value
                    )}
                  </div>
                </div>
              ))}
            </div>

            {row.matched_keywords.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  Matched Keywords
                  <span className="h-px flex-1 bg-border" />
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {row.matched_keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand border border-brand/20"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                Company Details
                <span className="h-px flex-1 bg-border" />
              </h3>
              <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
                {companyDetails.map((entry) => (
                  <Fragment key={entry.label}>
                    <span className="text-text-secondary truncate" title={entry.label}>{entry.label}</span>
                    <span className="break-words">{entry.value}</span>
                  </Fragment>
                ))}
              </div>
            </div>

            {descriptionEntries.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  Company Description(s)
                  <span className="h-px flex-1 bg-border" />
                </h3>
                <div className="space-y-3">
                  {descriptionEntries.map((entry) => (
                    <div key={entry.label} className="rounded-lg border border-border bg-surface-1 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{entry.label}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm text-text-primary">{entry.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {row.matches && row.matches.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  Match Highlights
                  <span className="h-px flex-1 bg-border" />
                </h3>
                <div className="space-y-2">
                  {row.matches.map((m, i) => (
                    <div key={i} className="p-3 rounded-md border border-border bg-surface-1 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-brand">{m.keyword}</span>
                        <span className="text-xs text-text-tertiary">in {m.source}</span>
                      </div>
                      <MarkedSnippet
                        html={m.sentence}
                        className="text-text-secondary leading-relaxed [&_mark]:bg-brand/20 [&_mark]:text-brand [&_mark]:font-semibold [&_mark]:rounded [&_mark]:px-0.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <span className="sr-only">Min width: {DRAWER_MIN_WIDTH}px</span>
      </SheetContent>
    </Sheet>
  );
}
