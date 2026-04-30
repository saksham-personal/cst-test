import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { X, FileSpreadsheet, FileText, Table2, Brain, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getExportSearchUrl } from '../../api/endpoints';
import type { ExportSearchRequest, ExportFormat, ExportLayout } from '../../api/types';

type ExportKind = 'pitchbook' | 'xlsx' | 'csv' | 'llm';
type ExportSource = 'search' | 'list';

interface ExportOption {
  kind: ExportKind;
  label: string;
  description: string;
  format: ExportFormat;
  layout: ExportLayout;
  icon: typeof FileSpreadsheet;
  accent: string;
}

const OPTIONS: ExportOption[] = [
  {
    kind: 'pitchbook',
    label: 'PB Export',
    description:
      'PitchBook upload workbook — exactly 4 columns: Company, Website, City, State. City/State are split from "Location of HQ".',
    format: 'xlsx',
    layout: 'pitchbook',
    icon: Table2,
    accent: 'text-indigo-600',
  },
  {
    kind: 'xlsx',
    label: 'Excel Export',
    description:
      'Full Excel workbook. Includes composite score, match %, matched keywords, highlight snippets, plus all metadata columns.',
    format: 'xlsx',
    layout: 'standard',
    icon: FileSpreadsheet,
    accent: 'text-emerald-600',
  },
  {
    kind: 'csv',
    label: 'CSV Export',
    description:
      'Comma-separated values. Same column set as the Excel export but stored as plain text for spreadsheets and scripts.',
    format: 'csv',
    layout: 'standard',
    icon: FileText,
    accent: 'text-amber-600',
  },
  {
    kind: 'llm',
    label: 'LLM Export',
    description:
      'Compact workbook for model ingestion with only index, Company, Website, and a newline-joined Description field.',
    format: 'xlsx',
    layout: 'llm',
    icon: Brain,
    accent: 'text-fuchsia-600',
  },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Search mode: cached search_id. List mode: saved list name. */
  searchId?: string | null;
  listName?: string | null;
  totalCount: number;
  /** Defaults to 'search' to preserve existing call sites. */
  source?: ExportSource;
}

export function getExportListUrl(listName: string, format: string, layout: string): string {
  const baseURL = (import.meta as any).env.VITE_API_BASE || '/api';
  const params = new URLSearchParams({
    format,
    layout,
    include_metadata: 'true',
  });
  return `${baseURL}/v1/exports/lists/${encodeURIComponent(listName)}?${params.toString()}`;
}

export function ExportDialog({
  open,
  onOpenChange,
  searchId = null,
  listName = null,
  totalCount,
  source = 'search',
}: ExportDialogProps) {
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const identifier = source === 'search' ? searchId : listName;
  const titlePrefix = source === 'search' ? 'Export Results' : `Export "${listName || ''}"`;

  const handleExport = async (opt: ExportOption) => {
    if (!identifier) {
      toast.warning(
        source === 'search'
          ? 'Run a search first before exporting.'
          : 'Select a list first before exporting.',
      );
      return;
    }
    setBusy(opt.kind);
    const toastId = toast.loading(
      `Preparing ${opt.label}${totalCount ? ` (${totalCount.toLocaleString()} rows)` : ''}…`,
    );
    try {
      let downloadUrl: string;

      if (source === 'search') {
        const payload: ExportSearchRequest = {
          format: opt.format,
          layout: opt.layout,
          include_highlights: opt.layout === 'standard',
          include_metadata: true,
          highlight_limit: 200,
        };
        downloadUrl = getExportSearchUrl(identifier as string, payload);
      } else {
        downloadUrl = getExportListUrl(identifier as string, opt.format, opt.layout);
      }

      // Instead of holding in memory, use browser navigation to download directly
      window.location.href = downloadUrl;
      
      toast.success(`${opt.label} download started`, { id: toastId });
      onOpenChange(false);
    } catch (err: any) {
      console.error('Export failed', err);
      toast.error(`${opt.label} failed`, {
        id: toastId,
        description: err?.message || 'Unknown error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-2xl !w-[640px] !p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">{titlePrefix}</DialogTitle>
            <DialogDescription>
              {totalCount > 0
                ? `${totalCount.toLocaleString()} compan${totalCount === 1 ? 'y' : 'ies'} in this ${source === 'search' ? 'result set' : 'list'}`
                : source === 'search'
                  ? 'No results to export yet'
                  : 'This list is empty'}
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -mt-1"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isBusy = busy === opt.kind;
            return (
              <button
                key={opt.kind}
                disabled={busy !== null || !identifier}
                onClick={() => handleExport(opt)}
                className={
                  'group relative flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface-1 text-left ' +
                  'transition-all hover:border-brand/40 hover:bg-brand/5 hover:shadow-sm ' +
                  'disabled:opacity-60 disabled:cursor-not-allowed ' +
                  (isBusy ? '!border-brand ring-2 ring-brand/20' : '')
                }
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md bg-surface-0 border border-border ${opt.accent}`}>
                    {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="font-semibold text-sm text-text-primary">{opt.label}</span>
                </div>
                <p className="text-xs text-text-tertiary leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-surface-1">
          <p className="text-xs text-text-tertiary">
            Large exports can take a few seconds. A toast will confirm completion.
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
            {busy ? 'Working…' : 'Cancel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
