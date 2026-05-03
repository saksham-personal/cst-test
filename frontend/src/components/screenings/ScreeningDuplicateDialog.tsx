import { useEffect, useState } from 'react';
import { CopyPlus, FolderOpen, Loader2 } from 'lucide-react';
import type { ScreeningDocumentSummary, ScreeningDuplicateItem } from '../../api/types';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ScreeningDuplicateDialogProps {
  open: boolean;
  document: ScreeningDocumentSummary | null;
  screenings: ScreeningDuplicateItem[];
  defaultReuseScreeningId: string | null;
  isCreatingNew: boolean;
  onOpenChange: (open: boolean) => void;
  onReuse: (screeningId: string) => void;
  onCreateNew: () => void;
}

export function ScreeningDuplicateDialog({
  open,
  document,
  screenings,
  defaultReuseScreeningId,
  isCreatingNew,
  onOpenChange,
  onReuse,
  onCreateNew,
}: ScreeningDuplicateDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(defaultReuseScreeningId);

  useEffect(() => {
    setSelectedId(defaultReuseScreeningId ?? screenings[0]?.id ?? null);
  }, [defaultReuseScreeningId, screenings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="!w-[680px] !max-w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Matching screening form already exists</DialogTitle>
          <DialogDescription>
            This PDF hash is already stored. Reuse an existing screening draft or create a new draft linked to the same document.
          </DialogDescription>
        </DialogHeader>

        {document && (
          <div className="rounded-lg border border-border bg-surface-1 p-3 text-sm">
            <div className="font-medium text-text-primary">{document.original_filename}</div>
            <div className="mt-1 text-xs text-text-secondary">Hash: {document.pdf_sha256.slice(0, 16)}…</div>
          </div>
        )}

        <div className="space-y-2">
          {screenings.map((screening) => (
            <button
              key={screening.id}
              type="button"
              onClick={() => setSelectedId(screening.id)}
              className={cn(
                'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                selectedId === screening.id
                  ? 'border-brand bg-brand/5 ring-1 ring-brand/20'
                  : 'border-border bg-card hover:bg-surface-1',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-text-primary">{screening.screen_name || 'Untitled draft'}</div>
                  <div className="text-xs text-text-secondary">Status: {screening.status}</div>
                </div>
                <div className="text-right text-xs text-text-tertiary">
                  <div>Updated</div>
                  <div>{screening.updated_at || '—'}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreatingNew}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (selectedId) onReuse(selectedId);
            }}
            disabled={!selectedId || isCreatingNew}
          >
            <FolderOpen className="mr-2 size-4" />
            Reuse existing
          </Button>
          <Button onClick={onCreateNew} disabled={!document || isCreatingNew}>
            {isCreatingNew ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CopyPlus className="mr-2 size-4" />}
            Create new screening
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
