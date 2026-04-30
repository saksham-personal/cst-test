import { useState, useEffect, useRef, useCallback } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Play, CheckCircle2, Loader2, XCircle, Upload, FileSpreadsheet, X } from 'lucide-react';
import { uploadIndexJob, getIndexJobs, activateIndexJob, cancelIndexJob } from '../api/endpoints';
import type { IndexJobDetail } from '../api/types';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function BuildIndexPage() {
  const [file, setFile] = useState<File | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [activateOnSuccess, setActivateOnSuccess] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [jobs, setJobs] = useState<IndexJobDetail[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousJobStatesRef = useRef<Record<string, string>>({});
  const acknowledgedActivationToastsRef = useRef<Set<string>>(new Set());

  const loadJobs = useCallback(async () => {
    try {
      const data = await getIndexJobs();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      // Backend may not be running yet
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const hasActiveJobs = jobs.some((job) => ['queued', 'running', 'activating'].includes(job.state));
    if (!hasActiveJobs) return;

    const intervalId = window.setInterval(() => {
      void loadJobs();
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [jobs, loadJobs]);

  useEffect(() => {
    jobs.forEach((job) => {
      const previousState = previousJobStatesRef.current[job.job_id];
      if (
        previousState
        && previousState !== 'activated'
        && job.state === 'activated'
        && !acknowledgedActivationToastsRef.current.has(job.job_id)
      ) {
        toast.success(job.message || `Bundle ${job.output_bundle_name || job.job_id.slice(0, 8)} activated`);
        acknowledgedActivationToastsRef.current.add(job.job_id);
      }
      previousJobStatesRef.current[job.job_id] = job.state;
    });
  }, [jobs]);

  const handleFileChosen = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast.warning('Please choose an .xlsx file');
      return;
    }
    setFile(f);
    if (!bundleName) {
      // Suggest a bundle name from filename (sans extension).
      const base = f.name.replace(/\.xlsx$/i, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      setBundleName(base);
    }
  };

  const handleStartBuild = async () => {
    if (!file) {
      toast.warning('Choose an Excel file first');
      return;
    }
    if (!bundleName.trim()) {
      toast.warning('Enter a bundle name');
      return;
    }
    setIsSubmitting(true);
    setUploadPct(0);
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      await uploadIndexJob(
        file,
        { output_bundle_name: bundleName, activate_on_success: activateOnSuccess },
        (pct) => {
          setUploadPct(pct);
          toast.loading(`Uploading ${file.name}… ${pct}%`, { id: toastId });
        },
      );
      toast.success('Index build started', { id: toastId });
      setFile(null);
      setBundleName('');
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadJobs();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to start build';
      toast.error(typeof detail === 'string' ? detail : 'Failed to start build', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (jobId: string) => {
    const toastId = toast.loading('Activating bundle…');
    try {
      const activatedJob = await activateIndexJob(jobId);
      acknowledgedActivationToastsRef.current.add(jobId);
      setJobs((current) => current.map((job) => (job.job_id === jobId ? activatedJob : job)));
      toast.success(activatedJob.message || 'Bundle activated', { id: toastId });
      await loadJobs();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Activation failed';
      toast.error(typeof detail === 'string' ? detail : 'Activation failed', { id: toastId });
    }
  };

  const handleCancel = async (jobId: string) => {
    const toastId = toast.loading('Cancelling build…');
    try {
      const cancelledJob = await cancelIndexJob(jobId);
      setJobs((current) => current.map((job) => (job.job_id === jobId ? cancelledJob : job)));
      toast.success(cancelledJob.message || 'Index build cancelled', { id: toastId });
      await loadJobs();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Cancellation failed';
      toast.error(typeof detail === 'string' ? detail : 'Cancellation failed', { id: toastId });
    }
  };

  const stateIcon = (state: string) => {
    if (state === 'completed' || state === 'activated') return <CheckCircle2 className="size-3.5 text-emerald-600" />;
    if (state === 'failed') return <XCircle className="size-3.5 text-danger" />;
    if (state === 'cancelled') return <XCircle className="size-3.5 text-text-tertiary" />;
    if (state === 'running' || state === 'activating') return <Loader2 className="size-3.5 animate-spin text-brand" />;
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Build Index" />

      <div className="flex-1 overflow-auto p-6 flex gap-6 mt-0">

        {/* Left Side: New Job Form */}
        <div className="w-[440px] flex-shrink-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Index Build</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Excel file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
                />
                {!file ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFileChosen(f);
                    }}
                    className={
                      'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-sm ' +
                      'cursor-pointer transition-colors select-none ' +
                      (isDragging
                        ? 'border-brand bg-brand/5 text-brand'
                        : 'border-border bg-surface-1 text-text-secondary hover:border-brand/60 hover:bg-brand/5 hover:text-brand')
                    }
                  >
                    <Upload className="h-5 w-5" />
                    <span className="font-medium">Click to browse or drop an .xlsx file</span>
                    <span className="text-xs text-text-tertiary">The file is uploaded to the backend for indexing.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={file.name}>{file.name}</div>
                      <div className="text-xs text-text-tertiary">{formatBytes(file.size)}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-text-tertiary hover:text-danger"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={isSubmitting}
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bundle name</label>
                <Input
                  placeholder="e.g., q2_targets"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={activateOnSuccess}
                  onCheckedChange={(v) => setActivateOnSuccess(!!v)}
                />
                Activate on success
              </label>

              {isSubmitting && uploadPct > 0 && uploadPct < 100 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>Uploading…</span>
                    <span className="font-mono tabular-nums">{uploadPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              <Button className="w-full mt-2" onClick={handleStartBuild} disabled={isSubmitting || !file}>
                {isSubmitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
                Start Build
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Recent Jobs */}
        <div className="flex-1">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg">Recent Jobs</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadJobs}>Refresh</Button>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-auto">
              {jobs.length === 0 && (
                <div className="text-sm text-text-tertiary italic text-center py-8">
                  No index build jobs yet.
                </div>
              )}
              {jobs.map((job) => (
                <div key={job.job_id} className="p-4 border rounded-lg bg-surface-2 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {job.job_id.slice(0, 8)}
                      <span className="text-muted-foreground mx-1">|</span>
                      {job.output_dir?.split('/').pop() || 'unnamed'}
                    </span>
                    <span className="text-xs font-semibold flex items-center gap-1">
                      {stateIcon(job.state)} {job.state}
                    </span>
                  </div>

                  {['queued', 'running', 'activating'].includes(job.state) && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${job.percent}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-primary">{job.percent}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <div className="min-w-0 space-y-1">
                          <div>stage: {job.stage}</div>
                          <div className="truncate">{job.message}</div>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          variant="outline"
                          onClick={() => handleCancel(job.job_id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}

                  {job.state === 'completed' && (
                    <div className="flex items-center gap-2 justify-end mt-1">
                      <Button size="sm" className="h-7 text-xs" variant="outline" onClick={() => handleActivate(job.job_id)}>
                        Activate
                      </Button>
                    </div>
                  )}

                  {job.state === 'failed' && (
                    <div className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger space-y-1">
                      <div className="font-medium">{job.message || 'Index build failed'}</div>
                      {job.error && (
                        <pre className="whitespace-pre-wrap break-words text-[11px] text-danger/90 max-h-40 overflow-auto">{job.error}</pre>
                      )}
                    </div>
                  )}

                  {job.state === 'cancelled' && (
                    <div className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-text-secondary">
                      {job.message || 'Index build cancelled'}
                    </div>
                  )}

                  {job.state === 'activated' && (
                    <div className="flex items-center justify-end mt-1 text-xs font-medium text-emerald-700">
                      Active bundle
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
