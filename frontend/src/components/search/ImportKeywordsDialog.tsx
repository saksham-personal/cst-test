import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Download, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Keyword, KeywordAction, KeywordMode } from '../../stores/searchStore';

interface ImportKeywordsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (keywords: Keyword[]) => void;
}

type Mode = 'paste' | 'upload';

const TEMPLATE_CSV = `#,keyword,mode,action,weight
1,manufacturer,lexical,include,1
2,"air filter",lexical,include,1
3,distributor,lexical,exclude,1
`;

/**
 * Import Keywords dialog. Matches the Streamlit reference (search_app_impl.py:1066):
 *   - Paste text (newline-separated keywords, or CSV with #, keyword, mode, action, weight)
 *   - Upload CSV file
 *   - Downloadable template
 * Client-side parser mirrors the backend services/keywords.py logic.
 */
export function ImportKeywordsDialog({ open, onOpenChange, onImport }: ImportKeywordsDialogProps) {
  const [mode, setMode] = useState<Mode>('paste');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'keywords_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    // Strip BOM
    const cleaned = text.replace(/^\uFEFF/, '');
    const parsed = parseKeywords(cleaned);
    if (parsed.length === 0) {
      toast.error('No keywords found in file.');
      return;
    }
    onImport(parsed);
    toast.success(`Imported ${parsed.length} keyword${parsed.length === 1 ? '' : 's'}`);
    onOpenChange(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePasteImport = () => {
    const parsed = parseKeywords(pasteText);
    if (parsed.length === 0) {
      toast.error('No keywords found in pasted text.');
      return;
    }
    onImport(parsed);
    toast.success(`Imported ${parsed.length} keyword${parsed.length === 1 ? '' : 's'}`);
    setPasteText('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-2xl !w-[600px] !p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">Import Keywords</DialogTitle>
            <DialogDescription>
              Paste a list or upload a CSV file. Supports newline-separated keywords or a full CSV with mode, action, and weight columns.
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -mt-1"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex rounded-md border border-border bg-surface-1 p-0.5 text-sm">
            <button
              className={
                'px-3 py-1.5 rounded transition-colors ' +
                (mode === 'paste'
                  ? 'bg-surface-0 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary')
              }
              onClick={() => setMode('paste')}
            >
              Paste Text
            </button>
            <button
              className={
                'px-3 py-1.5 rounded transition-colors ' +
                (mode === 'upload'
                  ? 'bg-surface-0 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary')
              }
              onClick={() => setMode('upload')}
            >
              Upload CSV
            </button>
          </div>
        </div>

        <div className="px-5 py-4 min-h-[240px]">
          {mode === 'paste' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Keywords
              </label>
              {/* Sticky, non-editable header that documents the CSV schema.
                  Analysts paste body rows below without re-typing the header. */}
              <div className="rounded-md border border-border bg-surface-0 overflow-hidden">
                <div className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_6rem_6rem_4rem] bg-brand/5 border-b border-brand/20 text-[11px] font-mono font-semibold uppercase tracking-wider text-brand">
                  <span className="px-2 py-1.5 border-r border-brand/15">#</span>
                  <span className="px-2 py-1.5 border-r border-brand/15">keyword</span>
                  <span className="px-2 py-1.5 border-r border-brand/15">mode</span>
                  <span className="px-2 py-1.5 border-r border-brand/15">action</span>
                  <span className="px-2 py-1.5 text-right">weight</span>
                </div>
                <textarea
                  className="w-full h-44 resize-y bg-surface-0 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/50"
                  placeholder={`1,manufacturer,lexical,include,1\n2,"air filter",lexical,include,1\n3,distributor,lexical,exclude,1\n\n— or one keyword per line —\nmanufacturer\n"air filter"\ndistributor`}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
              </div>
              <p className="text-xs text-text-tertiary">
                Paste rows in the format shown above — the header is already provided, so you
                don't need to retype it. Plain text with one keyword per line is also accepted.
              </p>
            </div>
          )}

          {mode === 'upload' && (
            <div className="flex flex-col gap-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center gap-3 bg-surface-1 hover:border-brand/40 hover:bg-brand/5 cursor-pointer transition-colors"
                onClick={handleFilePick}
              >
                <Upload className="h-8 w-8 text-text-tertiary" />
                <div className="text-center">
                  <div className="text-sm font-medium text-text-primary">Click to choose a CSV file</div>
                  <div className="text-xs text-text-tertiary mt-1">
                    Expected columns: #, keyword, mode, action, weight
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Download template
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'paste' && (
            <Button onClick={handlePasteImport} disabled={!pasteText.trim()}>
              Import
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser — mirrors backend services/keywords.py and search_app_impl.py:960-1063
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse keyword input. Two supported input shapes:
 *  1. "Plain mode" — no commas anywhere: each non-empty line is a keyword.
 *  2. "CSV mode"   — a header row containing at least a `keyword` column; additional
 *     recognized columns: `#` / `serial` / `no`, `mode`, `action`, `weight`.
 *     When `#` is present it's used to sort rows and then dropped.
 */
export function parseKeywords(raw: string): Keyword[] {
  const text = (raw || '').trim();
  if (!text) return [];

  const hasCommas = text.includes(',');
  if (!hasCommas) {
    // Plain mode
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => makeKeyword({ keyword: line }));
  }

  // CSV mode — minimal parser (handles quoted values)
  const rows = parseCsv(text);
  if (rows.length < 1) return [];
  const rawHeader = rows[0].map((h) => normalizeHeader(h));

  // Single-column CSV with no `keyword` column → assume it's a column of keywords
  if (rows[0].length === 1 && rawHeader[0] !== 'keyword') {
    return rows
      .slice(rawHeader[0] === '' ? 1 : 0) // skip empty header
      .map((r) => r[0]?.trim())
      .filter(Boolean)
      .map((kw) => makeKeyword({ keyword: kw }));
  }

  const headerIdx: Record<string, number> = {};
  rawHeader.forEach((h, i) => {
    headerIdx[h] = i;
  });

  const keywordCol = headerIdx['keyword'];

  // Header-less CSV (e.g. "1,manufacturer,exact,include,1"). Detected when
  // no `keyword` column header is present but the first column of every
  // row is an integer serial (the tell-tale signature of our sticky-header
  // schema: [#, keyword, mode, action, weight]). The UI renders the header
  // on-screen as a sticky label so analysts don't have to retype it.
  const looksLikeHeaderlessData =
    keywordCol === undefined
    && rows[0].length >= 2
    && rows.every(
      (r) =>
        r.length >= 2
        && (r[1] || '').trim() !== ''
        && Number.isFinite(parseInt((r[0] || '').trim()))
        && /^\d+$/.test((r[0] || '').trim()),
    );

  if (looksLikeHeaderlessData) {
    const parsed = rows
      .map((row) => {
        const keyword = (row[1] || '').trim();
        if (!keyword) return null;
        const serial = parseInt((row[0] || '').trim());
        return {
          serial: Number.isFinite(serial) ? serial : undefined,
          keyword,
          mode: normalizeMode(row[2]),
          action: normalizeAction(row[3]),
          weight: normalizeWeight(row[4]),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (parsed.every((r) => typeof r.serial === 'number')) {
      parsed.sort((a, b) => (a.serial! - b.serial!));
    }
    return parsed.map((r) => makeKeyword(r));
  }

  if (keywordCol === undefined) {
    // No header and doesn't look like the 5-column schema → treat every
    // row's first column as a keyword.
    return rows
      .map((r) => r[0]?.trim())
      .filter(Boolean)
      .map((kw) => makeKeyword({ keyword: kw }));
  }

  const serialCol = headerIdx['#'] ?? headerIdx['serial'] ?? headerIdx['no'];
  const modeCol = headerIdx['mode'];
  const actionCol = headerIdx['action'];
  const weightCol = headerIdx['weight'];

  const body = rows.slice(1);
  const parsed = body
    .map((row) => {
      const keyword = (row[keywordCol] || '').trim();
      if (!keyword) return null;
      const serial = serialCol !== undefined ? parseInt(row[serialCol] || '') : NaN;
      return {
        serial: Number.isFinite(serial) ? serial : undefined,
        keyword,
        mode: normalizeMode(modeCol !== undefined ? row[modeCol] : undefined),
        action: normalizeAction(actionCol !== undefined ? row[actionCol] : undefined),
        weight: normalizeWeight(weightCol !== undefined ? row[weightCol] : undefined),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (serialCol !== undefined && parsed.every((r) => typeof r.serial === 'number')) {
    parsed.sort((a, b) => (a.serial! - b.serial!));
  }

  return parsed.map((r) => makeKeyword(r));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      cell = '';
      if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
      i++;
      if (ch === '\r' && text[i] === '\n') i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string): string {
  return (h || '').trim().toLowerCase();
}

function normalizeMode(v: string | undefined): KeywordMode {
  const s = (v || '').trim().toLowerCase();
  return s === 'semantic' ? 'semantic' : 'lexical';
}

function normalizeAction(v: string | undefined): KeywordAction {
  const s = (v || '').trim().toLowerCase();
  return s === 'exclude' || s === 'not' || s === 'no' ? 'exclude' : 'include';
}

function normalizeWeight(v: string | undefined): number {
  const n = parseInt((v || '').trim() || '1');
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function makeKeyword(p: {
  keyword: string;
  mode?: KeywordMode;
  action?: KeywordAction;
  weight?: number;
  serial?: number;
}): Keyword {
  return {
    id: crypto.randomUUID(),
    keyword: p.keyword,
    mode: p.mode ?? 'lexical',
    action: p.action ?? 'include',
    weight: p.weight ?? 1,
    ...(typeof p.serial === 'number' ? { serial: p.serial } : {}),
  };
}
