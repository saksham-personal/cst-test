import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { BatchSizeControl } from './BatchSizeControl';
import { Expand, Upload, FileCheck2, AlertCircle, Loader2, Download, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { downloadBlob, getIndependentLLMOutputUrl } from '../../api/endpoints';


const MODELS = [
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', state: 'Stable' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', state: 'Stable' },
  { id: 'gpt-4o', name: 'GPT-4o', state: 'Preview' },
];

type IndependentState = 'select' | 'form' | 'running' | 'done';

interface IndependentUseCaseFlowProps {
  onActivityStart?: () => void;
}
 
export function IndependentUseCaseFlow({ onActivityStart }: IndependentUseCaseFlowProps) {
  const [state, setState] = useState<IndependentState>('select');
  const [selectedCase, setSelectedCase] = useState<string>('');

  /* form */
  const [useCaseName, setUseCaseName] = useState('');
  const [batchSize, setBatchSize] = useState(20);
  const [inputCols, setInputCols] = useState('index,');
  const [outputCols, setOutputCols] = useState('index,');
  const [prompt, setPrompt] = useState('');
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [fileStatus, setFileStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [model, setModel] = useState('');

  /* run */
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const mockCases = [
    { id: '1', name: 'Vendor Analysis Q3', state: 'ongoing' },
    { id: '2', name: 'Competitor Feature Extraction', state: 'completed' },
  ];

  const handleSelectCase = (val: string | null) => {
    setSelectedCase(val || '');
  };

  const openNewCase = () => {
    setState('form');
    setUseCaseName('');
    setInputCols('index,');
    setOutputCols('index,');
    setPrompt('');
    setBatchSize(20);
    setFileStatus('idle');
    setFileName('');
    setFileError('');
    setModel('');
  };

  const openExistingCase = () => {
    if (!selectedCase) return;
    setState('form');
    const c = mockCases.find(x => x.id === selectedCase);
    setUseCaseName(c?.name || '');
    setInputCols('index, company_name, description');
    setOutputCols('index, score, summary');
    setPrompt('Extract feature summary from description.');
    setBatchSize(10);
    setFileStatus('idle');
    setFileName('');
    setModel('gemini-1.5-pro');
  };

  /* prevent erasing the "index," prefix */
  const handleColChange = (setter: React.Dispatch<React.SetStateAction<string>>, val: string) => {
    if (!val.startsWith('index,')) {
      return; // ignore keystrokes that would remove prefix
    }
    setter(val);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileStatus('validating');
    setFileError('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('No worksheets found in the uploaded dataset.');
      const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(workbook.Sheets[sheetName], {
        header: 1,
        blankrows: false,
      });
      const headers = (rows[0] || []).map((value) => String(value ?? '').trim()).filter(Boolean);
      if (headers.length === 0) throw new Error('Header row 1 is empty.');
      if (headers[0].toLowerCase() !== 'index') {
        throw new Error('Index not provided: the first column in header row 1 must be index.');
      }
      const inputColumnText = headers.map((header, index) => (index === 0 ? 'index' : header)).join(', ');
      setInputCols(inputColumnText);
      setFileStatus('success');
      toast.success(`Validated ${file.name}. Input columns were filled from header row 1.`);
    } catch (error: any) {
      const message = error?.message || 'Failed to validate dataset.';
      setFileStatus('error');
      setFileError(message);
      toast.error(message);
    }
  };

  const handleStartRun = () => {
    onActivityStart?.();
    setState('running');
    setProgress(0);
    setErrors(0);
  };

  /* simulate progress */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === 'running' && progress < 100) {
      interval = setInterval(() => {
        setProgress(p => Math.min(100, p + Math.floor(Math.random() * 8) + 1));
        if (Math.random() > 0.85) setErrors(e => e + 1);
      }, 400);
    } else if (progress >= 100 && state === 'running') {
      setTimeout(() => setState('done'), 800);
    }
    return () => clearInterval(interval);
  }, [state, progress]);

  /* native progress bar */
  const ProgressBar = ({ value, className }: { value: number; className?: string }) => (
    <div className={cn("w-full h-4 bg-border rounded-full overflow-hidden", className)}>
      <div
        className="h-full bg-brand rounded-full"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );

  const isFormValid = useCaseName.trim() !== '' && fileStatus === 'success' && model !== '';

  const handleDownloadOutput = async () => {
    setDownloading(true);
    try {
      const response = await fetch(getIndependentLLMOutputUrl(useCaseName || 'Independent Use Case'));
      if (!response.ok) throw new Error('Failed to download backend-generated output.');
      const blob = await response.blob();
      downloadBlob(blob, `${(useCaseName || 'Independent_Use_Case').replace(/\s+/g, '_')}_LLMExport.xlsx`);
      toast.success('Downloaded backend-generated stub XLSX output.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to download output.');
    } finally {
      setDownloading(false);
    }
  };

  /* ─── RENDER ─── */
  return (
    <div className="space-y-6">

      {/* ── SELECT ── */}
      {state === 'select' && (
        <div className="bg-surface-0 border rounded-xl p-6 shadow-sm space-y-5 max-w-lg">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Use Case</h3>

          {/* New Use Case action */}
          <Button
            variant="outline"
            className="w-full justify-start font-semibold text-brand border-brand/30 hover:bg-brand/5 hover:border-brand"
            onClick={openNewCase}
          >
            + New Use Case
          </Button>

          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span className="flex-1 h-px bg-border" />
            <span>or restore existing</span>
            <span className="flex-1 h-px bg-border" />
          </div>

          <Select value={selectedCase} onValueChange={handleSelectCase}>
            <SelectTrigger className="w-full h-auto py-2 bg-surface-0 items-center">
              <SelectValue placeholder="Choose Use case…" />
            </SelectTrigger>
            <SelectContent>
              {mockCases.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{c.state}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end">
            <Button
              disabled={!selectedCase}
              onClick={openExistingCase}
              className="bg-brand text-brand-fg hover:bg-brand-hover px-6"
            >
              Proceed
            </Button>
          </div>
        </div>
      )}

      {/* ── FORM ── */}
      {state === 'form' && (
        <div className="bg-surface-0 border rounded-xl shadow-sm overflow-hidden">
          {/* form header strip */}
          <div className="flex items-center gap-3 px-6 py-3 border-b bg-surface-1">
            <button
              type="button"
              className="cursor-pointer text-text-secondary hover:text-foreground"
              onClick={() => setState('select')}
            >
              <ArrowLeft className="size-4" />
            </button>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              {useCaseName || 'New Use Case'}
            </h3>
          </div>

          <div className="p-6 space-y-6">
            {/* Name + Model + Batch */}
            <div className="grid grid-cols-[1fr_220px_280px] gap-5 items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Use Case Name</label>
                <Input
                  value={useCaseName}
                  onChange={e => setUseCaseName(e.target.value)}
                  placeholder="e.g. Lead Scoring Model"
                  className="h-10 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Model</h4>
                <Select value={model} onValueChange={(val) => setModel(val || '')}>
                  <SelectTrigger className="w-full h-10 bg-surface-0 items-center">
                    <SelectValue placeholder="Select LLM Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-foreground">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{m.state}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Batch Size</label>
                <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-surface-1">
                  <BatchSizeControl value={batchSize} onChange={setBatchSize} min={1} max={50} className="w-[200px]" />
                </div>
              </div>
            </div>

            {/* Columns */}
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <h4 className="text-brand text-xs font-bold uppercase tracking-wider">Input Columns</h4>
                <Textarea
                  value={inputCols}
                  onChange={e => handleColChange(setInputCols, e.target.value)}
                  className="font-mono text-sm min-h-[80px] bg-surface-1"
                />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-brand text-xs font-bold uppercase tracking-wider">Output Columns</h4>
                <Textarea
                  value={outputCols}
                  onChange={e => handleColChange(setOutputCols, e.target.value)}
                  className="font-mono text-sm min-h-[80px] bg-surface-1"
                />
              </div>
            </div>

            {/* Prompt — fixed height, no auto-expand */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Prompt</h4>
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Enter system prompt instructions here…"
                  className="h-[120px] resize-none bg-surface-1 pr-10 text-sm"
                />
                <button
                  type="button"
                  className="absolute top-2.5 right-2.5 cursor-pointer p-1.5 rounded-md text-text-tertiary hover:text-foreground hover:bg-surface-2 z-10"
                  onClick={() => setIsPromptExpanded(true)}
                  title="Expand Prompt"
                >
                  <Expand className="size-4" />
                </button>
              </div>
            </div>

            {/* File */}
            <div className="grid grid-cols-1 gap-5 items-end">
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Dataset (.xlsx)</h4>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="file"
                      accept=".xlsx"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleFileUpload}
                    />
                    <Button variant="outline" className="gap-2 h-10">
                      <Upload className="size-4" /> Upload File
                    </Button>
                  </div>
                  {fileStatus === 'validating' && (
                    <span className="text-sm text-text-secondary flex items-center gap-1.5">
                      <Loader2 className="size-4 animate-spin" /> Validating…
                    </span>
                  )}
                  {fileStatus === 'success' && (
                    <span className="text-sm text-green-600 flex items-center gap-1.5">
                      <FileCheck2 className="size-4" /> {fileName}
                    </span>
                  )}
                  {fileStatus === 'error' && (
                    <span className="text-sm text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="size-4" /> {fileError}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                size="lg"
                className="bg-brand text-brand-fg hover:bg-brand-hover px-8"
                onClick={handleStartRun}
                disabled={!isFormValid}
              >
                Start Processing
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── RUNNING ── */}
      {state === 'running' && (
        <div className="bg-surface-0 border rounded-xl p-8 shadow-sm max-w-2xl mx-auto space-y-6 mt-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Processing: {useCaseName}</h2>
            <p className="text-sm text-text-tertiary">Do not close this window</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-text-secondary">
              <span>Overall Progress</span>
              <span>{Math.min(100, progress)}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          {errors > 0 && (
            <div className="flex items-center justify-center gap-2 text-red-600 bg-red-500/5 border border-red-500/20 rounded-lg py-3">
              <AlertCircle className="size-5" />
              <span className="font-semibold">Errors: {errors}</span>
            </div>
          )}
        </div>
      )}

      {/* ── DONE ── */}
      {state === 'done' && (
        <div className="flex flex-col items-center justify-center py-16 gap-6">
          <div className="size-16 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
            <FileCheck2 className="size-8" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold">Processing Complete</h2>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Download the results as an Excel file below.
            </p>
          </div>

          <Button size="lg" className="bg-brand text-brand-fg hover:bg-brand-hover gap-2 px-8 mt-2" onClick={handleDownloadOutput} disabled={downloading}>
            {downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
            {useCaseName}_LLMExport.xlsx
          </Button>

          <Button variant="link" className="text-text-secondary" onClick={() => setState('select')}>
            ← Return to Use Cases
          </Button>
        </div>
      )}

      {/* ── EXPANDED PROMPT DIALOG ── */}
      <Dialog open={isPromptExpanded} onOpenChange={setIsPromptExpanded}>
        <DialogContent className="h-[80vh] w-[min(70vw,1280px)] max-w-[calc(100vw-2rem)] p-6 sm:max-w-[min(70vw,1280px)] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Prompt</DialogTitle>
          </DialogHeader>
          <div className="flex-1 mt-4 relative">
            <Textarea
              className="absolute inset-0 resize-none bg-surface-0 border shadow-inner text-base p-6 h-full"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter comprehensive system prompt instructions…"
            />
          </div>
          <DialogFooter className="mt-4">
            <DialogClose render={<Button className="bg-brand hover:bg-brand-hover text-brand-fg">Done</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
