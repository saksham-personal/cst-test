import { useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface UploadPdfCardProps {
  file: File | null;
  previewOpen: boolean;
  isSubmitting: boolean;
  uploadPct: number;
  onFileSelected: (file: File | null) => void;
  onTogglePreview: () => void;
  onStartUpload: () => void;
}

export function UploadPdfCard({
  file,
  previewOpen,
  isSubmitting,
  uploadPct,
  onFileSelected,
  onTogglePreview,
  onStartUpload,
}: UploadPdfCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canPreview = useMemo(() => Boolean(file), [file]);

  const handleFileChosen = (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.pdf')) {
      toast.warning('Please choose a .pdf file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    onFileSelected(nextFile);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload Screening Form</CardTitle>
        <CardDescription>
          Upload a PDF intake form, preview it, then send it to the backend for extraction and draft creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose or drop a PDF screening form"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              const nextTarget = e.relatedTarget;
              if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) return;
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFileChosen(dropped);
            }}
            className={
              'flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-10 text-sm transition-colors ' +
              (isDragging
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-border bg-surface-1 text-text-secondary hover:border-brand/60 hover:bg-brand/5 hover:text-brand')
            }
          >
            <Upload className="size-5" />
            <span className="font-medium">Click to browse or drop a PDF form</span>
            <span className="text-xs text-text-tertiary">The PDF remains previewable after upload and deduplication.</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm">
            <FileText className="h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={file.name}>{file.name}</div>
              <div className="text-xs text-text-tertiary">{formatBytes(file.size)}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-tertiary hover:text-danger"
              onClick={() => {
                onFileSelected(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={isSubmitting}
              title="Remove file"
              aria-label="Remove selected PDF file"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {isSubmitting && uploadPct > 0 && uploadPct < 100 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>Uploading…</span>
              <span className="font-mono tabular-nums">{uploadPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-brand transition-all" style={{ width: `${uploadPct}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onTogglePreview} disabled={!canPreview}>
            {previewOpen ? 'Hide preview' : 'Preview PDF'}
          </Button>
          <Button onClick={onStartUpload} disabled={!file || isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            Upload form
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
