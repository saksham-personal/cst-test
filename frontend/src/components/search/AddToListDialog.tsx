import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { X, List as ListIcon, Plus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { addCompaniesFromSearchToList, addCompaniesToList, createList, getLists } from '../../api/endpoints';
import type { ListSummary } from '../../api/endpoints';
import type { SearchResultRow } from '../../api/types';

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: SearchResultRow[];
  sourceKeywords?: string[];
  /** When true, ignore `rows` and ask the backend to add every row from the
   *  cached search identified by `searchId`. */
  selectAll?: boolean;
  searchId?: string | null;
  totalCount?: number;
}

export function AddToListDialog({
  open,
  onOpenChange,
  rows,
  sourceKeywords,
  selectAll = false,
  searchId = null,
  totalCount = 0,
}: AddToListDialogProps) {
  const effectiveCount = selectAll ? totalCount : rows.length;
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setNewListName('');
    (async () => {
      setLoading(true);
      try {
        const data = await getLists();
        setLists(Array.isArray(data?.lists) ? data.lists : []);
      } catch {
        setLists([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const handleCreate = async () => {
    const name = newListName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createList(name);
      setLists((prev) =>
        prev.some((l) => l.name === name)
          ? prev
          : [...prev, { name, count: 0, updated_at: '' }].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelected(name);
      setNewListName('');
      toast.success(`Created list "${name}"`);
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Failed to create list';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleAdd = async () => {
    if (!selected) {
      toast.warning('Select or create a list first.');
      return;
    }
    if (effectiveCount === 0) {
      toast.warning('No companies to add.');
      return;
    }
    if (selectAll && !searchId) {
      toast.warning('No active search to add from.');
      return;
    }
    setAdding(true);
    const toastId = toast.loading(
      `Adding ${effectiveCount.toLocaleString()} compan${effectiveCount === 1 ? 'y' : 'ies'} to "${selected}"…`,
    );
    try {
      if (selectAll && searchId) {
        await addCompaniesFromSearchToList(selected, searchId, sourceKeywords || []);
      } else {
        const payload = rows.map((r) => {
          // The primary key is Crescendo ID. Prefer an explicit metadata value when
          // present, otherwise fall back to primary_key_value (which already holds
          // the Crescendo ID for indexes built after the primary-key migration).
          const crescendoId =
            (r.metadata?.['Crescendo ID'] as string | undefined) ||
            (r.metadata?.crescendo_id as string | undefined) ||
            r.primary_key_value;
          return {
            company: r.company_name || r.primary_key_value,
            primary_key_value: r.primary_key_value,
            crescendo_id: crescendoId,
            source_keywords: sourceKeywords,
          };
        });
        await addCompaniesToList(selected, payload);
      }
      toast.success(
        `Added ${effectiveCount.toLocaleString()} compan${effectiveCount === 1 ? 'y' : 'ies'} to "${selected}"`,
        { id: toastId },
      );
      onOpenChange(false);
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Failed to add to list';
      toast.error(message, { id: toastId });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-lg !w-[520px] !p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">Add to List</DialogTitle>
            <DialogDescription>
              {effectiveCount === 0
                ? 'No companies selected.'
                : `${effectiveCount.toLocaleString()} compan${effectiveCount === 1 ? 'y' : 'ies'} ready to add${selectAll ? ' (all results)' : ''}.`}
            </DialogDescription>
          </DialogHeader>
          <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Pick an existing list
            </label>
            <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-surface-0 divide-y divide-border">
              {loading ? (
                <div className="p-4 flex items-center gap-2 text-sm text-text-tertiary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lists…
                </div>
              ) : lists.length === 0 ? (
                <div className="p-4 text-sm text-text-tertiary italic">
                  No lists yet. Create one below.
                </div>
              ) : (
                lists.map((summary) => (
                  <button
                    key={summary.name}
                    onClick={() => setSelected(summary.name)}
                    className={
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ' +
                      (selected === summary.name
                        ? 'bg-brand/10 text-brand font-medium'
                        : 'text-text-primary hover:bg-surface-1')
                    }
                  >
                    <ListIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate flex-1">{summary.name}</span>
                    <span className="text-[10px] font-mono tabular-nums text-text-tertiary">
                      {summary.count}
                    </span>
                    {selected === summary.name && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Or create a new list
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="New list name…"
                value={newListName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewListName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
              <Button
                variant="outline"
                onClick={handleCreate}
                disabled={creating || !newListName.trim()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-1">Create</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={adding || !selected || effectiveCount === 0}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add {effectiveCount > 0 ? `${effectiveCount.toLocaleString()} ` : ''}to list
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
