import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

interface EditableFieldCardProps {
  fieldKey: string;
  label: string;
  value: string;
  multiline?: boolean;
  isSaving?: boolean;
  onSave: (nextValue: string) => Promise<void>;
}

export function EditableFieldCard({
  fieldKey,
  label,
  value,
  multiline = false,
  isSaving = false,
  onSave,
}: EditableFieldCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraftValue(value);
    }
  }, [editing, value]);

  const copyValue = async () => {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const saveIfChanged = async () => {
    const next = draftValue.trim();
    const current = value.trim();
    if (next === current) {
      setEditing(false);
      setDraftValue(value);
      return;
    }
    await onSave(draftValue);
    setEditing(false);
  };

  const cancelEdit = () => {
    skipBlurRef.current = true;
    setEditing(false);
    setDraftValue(value);
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold text-text-primary">{label}</CardTitle>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-text-tertiary">{fieldKey}</div>
        </div>
        <div className="flex items-center gap-1">
          {isSaving && <Loader2 className="size-4 animate-spin text-brand" />}
          <Button variant="ghost" size="icon-sm" onClick={copyValue} disabled={!value.trim()} title={`Copy ${label}`}>
            <Copy className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          multiline ? (
            <textarea
              autoFocus
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={async () => {
                if (skipBlurRef.current) {
                  skipBlurRef.current = false;
                  return;
                }
                await saveIfChanged();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  cancelEdit();
                  (e.currentTarget as HTMLTextAreaElement).blur();
                }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  (e.currentTarget as HTMLTextAreaElement).blur();
                }
              }}
              className="min-h-[160px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ) : (
            <Input
              autoFocus
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={async () => {
                if (skipBlurRef.current) {
                  skipBlurRef.current = false;
                  return;
                }
                await saveIfChanged();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  cancelEdit();
                  (e.currentTarget as HTMLInputElement).blur();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
          )
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditing(true)}
            className={cn(
              'w-full rounded-lg border border-dashed border-border bg-surface-1 px-3 py-3 text-left transition-colors',
              'hover:border-brand/50 hover:bg-brand/5',
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-text-tertiary">
              <Pencil className="size-3.5" />
              Double-click to edit
              {!isSaving && value.trim() && <Check className="ml-auto size-3.5 text-success" />}
            </div>
            <div className="whitespace-pre-wrap break-words font-mono text-sm text-text-primary">
              {value.trim() || '—'}
            </div>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
