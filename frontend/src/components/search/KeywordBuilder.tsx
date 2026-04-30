import { useMemo, useState } from 'react';
import { useSearchStore } from '../../stores/searchStore';
import { useKeywordColors } from '../../hooks/useKeywordColors';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, X, Upload, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ImportKeywordsDialog } from './ImportKeywordsDialog';

export function KeywordBuilder() {
  const {
    keywords,
    addKeyword,
    updateKeyword,
    removeKeyword,
    clearAll,
    setKeywords,
    keywordHitCounts,
  } = useSearchStore();
  const getColor = useKeywordColors();
  const [importOpen, setImportOpen] = useState(false);

  const anyHitCounts = useMemo(
    () => Object.keys(keywordHitCounts || {}).length > 0,
    [keywordHitCounts],
  );

  return (
    <div className="flex flex-col space-y-3 p-4 bg-surface-0 rounded-lg shadow-sm border border-border">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-text-primary">Keyword Builder</h2>
        {anyHitCounts && (
          <span className="text-xs text-text-tertiary">
            Hit counts reflect the most recent search
          </span>
        )}
      </div>

      {keywords.map((kw, idx) => {
        const color = getColor(kw.id, idx);
        const isExact = kw.keyword.startsWith('"') && kw.keyword.endsWith('"') && kw.keyword.length > 2;
        const hitCount = keywordHitCounts?.[kw.keyword];
        const showHitCount = kw.action === 'include' && hitCount !== undefined && kw.keyword.trim() !== '';

        return (
          <div key={kw.id} className={cn('flex items-center gap-3', kw.action === 'exclude' && 'opacity-70')}>
            {/* Serial chip (editable) */}
            <div
              className={cn(
                'flex items-center justify-center shrink-0 h-8 rounded-full text-xs font-bold ring-1 transition-all pl-1 pr-0.5',
                isExact
                  ? 'bg-gradient-to-br from-brand to-brand-hover text-white ring-transparent'
                  : '',
              )}
              style={!isExact ? { backgroundColor: color.bg, color: color.fg, borderColor: color.border } : {}}
              title="Serial number — used in boolean expressions like (1 AND 2) OR 3. Edit to renumber."
            >
              <span className="select-none">#</span>
              <input
                type="number"
                min={1}
                value={kw.serial ?? idx + 1}
                data-shortcut-target="keyword-serial"
                data-shortcut-index={idx + 1}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '') {
                    updateKeyword(kw.id, { serial: undefined });
                    return;
                  }
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n) && n > 0) {
                    updateKeyword(kw.id, { serial: n });
                  }
                }}
                className={cn(
                  'w-8 bg-transparent border-0 outline-none text-xs font-bold text-center',
                  'focus:ring-0 focus:outline-none',
                  'appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                )}
                style={{ color: 'inherit' }}
              />
            </div>

            {/* Input */}
            <div className="relative flex-1 flex items-center">
              <Input
                value={kw.keyword}
                data-shortcut-target="keyword-text"
                data-shortcut-index={idx + 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateKeyword(kw.id, { keyword: e.target.value })
                }
                placeholder="Enter keyword or phrase…"
                className={cn(
                  'pr-20 w-full',
                  isExact ? 'border-brand ring-1 ring-brand' : '',
                  kw.action === 'exclude' && 'line-through',
                )}
              />
              {isExact && (
                <span className="absolute right-2 px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-brand text-white rounded-sm pointer-events-none">
                  EXACT
                </span>
              )}
            </div>

            {/* Per-keyword hit-count chip */}
            {showHitCount && (
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium tabular-nums',
                  (hitCount ?? 0) > 0
                    ? 'bg-brand/10 text-brand border border-brand/20'
                    : 'bg-surface-1 text-text-tertiary border border-border',
                )}
                title={`${hitCount?.toLocaleString()} companies match "${kw.keyword}"`}
              >
                {(hitCount ?? 0).toLocaleString()}
                <span className="text-[10px] uppercase tracking-wider opacity-70">hits</span>
              </span>
            )}

            <Select
              value={kw.mode}
              onValueChange={(val) => val && updateKeyword(kw.id, { mode: val as 'lexical' | 'semantic' })}
            >
              <SelectTrigger className="w-28 text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lexical">Lexical</SelectItem>
                <SelectItem value="semantic" disabled>Semantic</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={kw.action}
              onValueChange={(val) => val && updateKeyword(kw.id, { action: val as 'include' | 'exclude' })}
            >
              <SelectTrigger className="w-28 text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">Include</SelectItem>
                <SelectItem value="exclude">Exclude</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-secondary whitespace-nowrap">Wt.</label>
              <Input
                type="number"
                min={1}
                value={kw.weight > 0 ? String(kw.weight) : ''}
                data-shortcut-target="keyword-weight"
                data-shortcut-index={idx + 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const raw = e.target.value.trim();
                  if (raw === '') {
                    updateKeyword(kw.id, { weight: 0 });
                    return;
                  }
                  const next = parseInt(raw, 10);
                  if (Number.isFinite(next) && next >= 0) {
                    updateKeyword(kw.id, { weight: next });
                  }
                }}
                onBlur={() => {
                  if (!kw.weight || kw.weight < 1) {
                    updateKeyword(kw.id, { weight: 1 });
                  }
                }}
                className="w-16 h-9 px-2 text-center"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-tertiary hover:text-danger hover:bg-danger/10"
              data-shortcut-target="keyword-remove"
              data-shortcut-index={idx + 1}
              onClick={() => removeKeyword(kw.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
        );
      })}

      {/* Footer controls */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          data-shortcut-target="keyword-add"
          onClick={() => addKeyword({ keyword: '', mode: 'lexical', action: 'include', weight: 1 })}
          className="gap-2 text-brand border-brand/20 hover:bg-brand/5"
        >
          <Plus className="size-4" /> Add Keyword
        </Button>

        <Button
          variant="ghost"
          size="sm"
          data-shortcut-target="keyword-import"
          onClick={() => setImportOpen(true)}
          className="gap-2 text-text-secondary"
        >
          <Upload className="size-4" /> Import
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="gap-2 text-text-secondary ml-auto hover:text-danger"
        >
          <Trash2 className="size-4" /> Clear All
        </Button>
      </div>

      <ImportKeywordsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(imported) => {
          setKeywords(imported);
        }}
      />
    </div>
  );
}
