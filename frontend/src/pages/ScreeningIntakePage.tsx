import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ScreeningIntakeResponse } from '../api/types';
import { createDuplicateScreening, uploadScreeningIntake } from '../api/endpoints';
import { PageHeader } from '../components/layout/PageHeader';
import { ScreeningDuplicateDialog } from '../components/screenings/ScreeningDuplicateDialog';
import { ScreeningPdfPreview } from '../components/screenings/ScreeningPdfPreview';
import { UploadPdfCard } from '../components/screenings/UploadPdfCard';

export function ScreeningIntakePage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [duplicateState, setDuplicateState] = useState<ScreeningIntakeResponse | null>(null);
  const [isCreatingDuplicate, setIsCreatingDuplicate] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelected = (nextFile: File | null) => {
    setFile(nextFile);
    if (!nextFile) {
      setPreviewOpen(false);
      setDuplicateState(null);
    }
  };

  const handleStartUpload = async () => {
    if (!file) {
      toast.warning('Choose a PDF file first');
      return;
    }
    setIsSubmitting(true);
    setUploadPct(0);
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      const response = await uploadScreeningIntake(file, (pct) => {
        setUploadPct(pct);
        toast.loading(`Uploading ${file.name}… ${pct}%`, { id: toastId });
      });
      if (response.status === 'created' && response.screening) {
        toast.success('Screening draft created', { id: toastId });
        navigate(`/screenings/${response.screening.id}`);
        return;
      }
      toast.success('Matching PDF already exists', { id: toastId });
      setDuplicateState(response);
    } catch {
      toast.dismiss(toastId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewFromDuplicate = async () => {
    if (!duplicateState?.document) return;
    setIsCreatingDuplicate(true);
    try {
      const screening = await createDuplicateScreening(duplicateState.document.id);
      toast.success('New screening draft created from existing document');
      navigate(`/screenings/${screening.id}`);
    } finally {
      setIsCreatingDuplicate(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1">
      <PageHeader title="Form Intake" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <UploadPdfCard
            file={file}
            previewOpen={previewOpen}
            isSubmitting={isSubmitting}
            uploadPct={uploadPct}
            onFileSelected={handleFileSelected}
            onTogglePreview={() => setPreviewOpen((current) => !current)}
            onStartUpload={handleStartUpload}
          />

          {previewUrl && (
            <ScreeningPdfPreview
              src={previewUrl}
              open={previewOpen}
              onToggle={() => setPreviewOpen((current) => !current)}
              title="Local PDF Preview"
            />
          )}
        </div>
      </div>

      <ScreeningDuplicateDialog
        open={Boolean(duplicateState)}
        document={duplicateState?.document ?? null}
        screenings={duplicateState?.existing_screenings ?? []}
        defaultReuseScreeningId={duplicateState?.default_reuse_screening_id ?? null}
        isCreatingNew={isCreatingDuplicate}
        onOpenChange={(open) => {
          if (!open) setDuplicateState(null);
        }}
        onReuse={(screeningId) => navigate(`/screenings/${screeningId}`)}
        onCreateNew={handleCreateNewFromDuplicate}
      />
    </div>
  );
}
