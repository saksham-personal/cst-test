import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { ScreeningDetail, ScreeningFieldPatchRequest } from '../api/types';
import {
  getScreeningDetail,
  getScreeningPdfUrl,
  patchScreeningFields,
  startScreening,
} from '../api/endpoints';
import { PageHeader } from '../components/layout/PageHeader';
import { ScreeningFieldGrid } from '../components/screenings/ScreeningFieldGrid';
import { ScreeningPdfPreview } from '../components/screenings/ScreeningPdfPreview';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';

export function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [screening, setScreening] = useState<ScreeningDetail | null>(null);
  const [screenNameInput, setScreenNameInput] = useState('');
  const [websiteInput, setWebsiteInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [savingByField, setSavingByField] = useState<Record<string, boolean>>({});

  const pdfUrl = useMemo(() => (screening ? getScreeningPdfUrl(screening.id) : ''), [screening]);

  const loadScreening = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const detail = await getScreeningDetail(id);
      setScreening(detail);
      setScreenNameInput(detail.screen_name ?? '');
      setWebsiteInput(detail.website ?? '');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadScreening();
  }, [loadScreening]);

  const persistPatch = useCallback(async (keys: string[], payload: ScreeningFieldPatchRequest) => {
    if (!id || !screening) return;
    setSavingByField((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });
    try {
      const saved = await patchScreeningFields(id, payload);
      setScreening((current) => current ? {
        ...current,
        status: saved.status,
        screen_name: saved.screen_name,
        website: saved.website,
        edited_fields: saved.edited_fields,
        updated_at: saved.updated_at,
      } : current);
      setScreenNameInput(saved.screen_name ?? '');
      setWebsiteInput(saved.website ?? '');
    } finally {
      setSavingByField((current) => {
        const next = { ...current };
        keys.forEach((key) => {
          next[key] = false;
        });
        return next;
      });
    }
  }, [id, screening]);

  const handleSaveField = useCallback(async (fieldKey: string, nextValue: string) => {
    await persistPatch([fieldKey], {
      edited_fields: {
        [fieldKey]: nextValue,
      },
    });
  }, [persistPatch]);

  const flushTopLevelIfNeeded = useCallback(async () => {
    if (!screening) return;
    const payload: ScreeningFieldPatchRequest = {};
    const keys: string[] = [];
    if (screenNameInput !== (screening.screen_name ?? '')) {
      payload.screen_name = screenNameInput;
      keys.push('screen_name');
    }
    if (websiteInput !== (screening.website ?? '')) {
      payload.website = websiteInput;
      keys.push('website');
    }
    if (keys.length > 0) {
      await persistPatch(keys, payload);
    }
  }, [persistPatch, screenNameInput, screening, websiteInput]);

  const handleStartScreening = async () => {
    if (!id) return;
    if (!screenNameInput.trim()) {
      toast.warning('Screen Name is required before starting screening');
      return;
    }
    setIsStarting(true);
    try {
      await flushTopLevelIfNeeded();
      const response = await startScreening(id);
      setScreening((current) => current ? { ...current, status: response.status } : current);
      toast.success(response.message);
      navigate(`/criteria-analysis/${id}`, {
        state: {
          seededScreeningPayload: response.payload,
          sourceScreeningId: id,
          sourcePdfName: screening?.original_filename ?? null,
        },
      });
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-1">
        <PageHeader title="Screening Draft" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      </div>
    );
  }

  if (!screening) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-1">
        <PageHeader title="Screening Draft" />
        <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
          Screening draft not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1">
      <PageHeader title="Screening Draft">
        <Button onClick={handleStartScreening} disabled={isStarting}>
          {isStarting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          Start Screening
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Screening Intake Draft</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>Screen Name *</span>
                  {savingByField.screen_name && <Loader2 className="size-3.5 animate-spin text-brand" />}
                </div>
                <Input
                  value={screenNameInput}
                  onChange={(e) => setScreenNameInput(e.target.value)}
                  onBlur={() => { void flushTopLevelIfNeeded(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Enter a required screening name"
                  className="h-10 text-lg font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>Website</span>
                  {savingByField.website && <Loader2 className="size-3.5 animate-spin text-brand" />}
                </div>
                <Input
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  onBlur={() => { void flushTopLevelIfNeeded(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Optional website"
                  className="h-10"
                />
              </div>

              <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-text-secondary md:col-span-2">
                <div>Source PDF: <span className="font-medium text-text-primary">{screening.original_filename}</span></div>
                <div className="mt-1">Status: <span className="font-medium text-text-primary">{screening.status}</span></div>
              </div>
            </CardContent>
          </Card>

          <ScreeningPdfPreview
            src={pdfUrl}
            open={previewOpen}
            onToggle={() => setPreviewOpen((current) => !current)}
          />

          <ScreeningFieldGrid
            fields={screening.edited_fields}
            savingByField={savingByField}
            onSaveField={handleSaveField}
          />
        </div>
      </div>
    </div>
  );
}
