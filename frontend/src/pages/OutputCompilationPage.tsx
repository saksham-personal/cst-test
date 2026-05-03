import { useState, useRef } from 'react';
import { Download, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useScreenStore } from '../stores/screenStore';

/* ─── File Upload Card Component ─── */
interface FileUploadCardProps {
  title: string;
  description: string;
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  isOptional?: boolean;
}

function FileUploadCard({ title, description, accept = ".csv, .xlsx", file, onFileChange, isOptional }: FileUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    onFileChange(selectedFile);
  };

  return (
    <div className={cn(
      "relative rounded-xl border p-6 flex flex-col items-center justify-center text-center transition-all bg-surface-0",
      file ? "border-brand bg-brand/[0.02]" : "border-border border-dashed hover:bg-surface-1"
    )}>
      <input
        type="file"
        ref={fileInputRef}
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      
      {file ? (
        <>
          <div className="size-12 rounded-full bg-brand/10 flex items-center justify-center mb-3">
            <FileSpreadsheet className="size-6 text-brand" />
          </div>
          <p className="text-sm font-semibold text-foreground max-w-[200px] truncate" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
          <Button 
            variant="ghost" 
            size="sm" 
            className="mt-4 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
          >
            Remove File
          </Button>
        </>
      ) : (
        <>
          <div className="size-12 rounded-full bg-surface-1 flex items-center justify-center mb-3">
            <Upload className="size-5 text-text-tertiary" />
          </div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-[240px]">
            {description}
          </p>
          {isOptional && (
            <Badge variant="outline" className="mt-2 text-xs text-text-tertiary">Optional</Badge>
          )}
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
          >
            Select File
          </Button>
        </>
      )}
    </div>
  );
}

export function OutputCompilationPage() {
  const { activeScreen, updateScreen } = useScreenStore();

  const [mappingListFile, setMappingListFile] = useState<File | null>(null);
  const [pitchbookDataFile, setPitchbookDataFile] = useState<File | null>(null);
  const [valueAddFile, setValueAddFile] = useState<File | null>(null);
  
  const [valueAddHeaders, setValueAddHeaders] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);

  /* Parse value add data headers */
  const handleValueAddFileChange = (file: File | null) => {
    setValueAddFile(file);
    setValueAddHeaders([]);

    if (!file) return;

    // Parse CSV
    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        preview: 1, // Only need first row
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setValueAddHeaders(results.data[0] as string[]);
          }
        },
        error: (error) => {
          console.error("CSV Parse Error", error);
          toast.error("Failed to parse CSV headers");
        }
      });
    } 
    // Parse XLSX
    else if (file.name.toLowerCase().endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Get headers using sheet_to_json with header: 1
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (json.length > 0) {
            setValueAddHeaders(json[0] as string[]);
          }
        } catch (error) {
          console.error("XLSX Parse Error", error);
          toast.error("Failed to parse XLSX headers");
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleCompile = async () => {
    if (!mappingListFile || !pitchbookDataFile) {
      toast.error("Please upload the required Pitchbook files.");
      return;
    }

    setIsCompiling(true);
    
    // Simulate compilation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsCompiling(false);
    toast.success("Output successfully compiled!");

    // Update screen store
    if (activeScreen) {
      updateScreen(activeScreen.id, {
        pipelineStatus: 'completed',
        pipelineStep: 'Output Compiled',
        isOngoing: false,
      });
    }

    // Trigger mock download
    const blob = new Blob(["mock compiled data"], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Compiled_Output_${activeScreen?.screenName || 'Screen'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    // Optionally navigate back to steps
    // navigate('/steps');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Output Compilation" />
      
      <div className="flex-1 overflow-auto p-8 relative">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="bg-surface-0 rounded-2xl border p-6 shadow-sm">
            <h2 className="text-xl font-bold text-foreground mb-1">Data Compilation</h2>
            <p className="text-sm text-text-secondary mb-8">
              Upload the required datasets to compile the final screening output. 
              Only .xlsx and .csv formats are supported.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FileUploadCard
                title="Pitchbook Mapping List"
                description="Upload the master ID mapping list from Pitchbook"
                file={mappingListFile}
                onFileChange={setMappingListFile}
              />
              <FileUploadCard
                title="Pitchbook Data"
                description="Upload the raw data export from Pitchbook"
                file={pitchbookDataFile}
                onFileChange={setPitchbookDataFile}
              />
              <FileUploadCard
                title="Value Add Data"
                description="Upload additional custom data points to merge"
                file={valueAddFile}
                onFileChange={handleValueAddFileChange}
                isOptional
              />
            </div>
            
            {/* Value Add Headers Preview */}
            {valueAddFile && valueAddHeaders.length > 0 && (
              <div className="mt-8 pt-6 border-t animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Detected Columns in Value Add Data:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {valueAddHeaders.map((header, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-surface-1 text-text-secondary font-medium px-3 py-1 border border-border">
                      {String(header) || `Column ${idx + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button
              size="lg"
              onClick={handleCompile}
              disabled={isCompiling || !mappingListFile || !pitchbookDataFile}
              className="bg-brand text-brand-fg hover:bg-brand-hover gap-2 h-14 px-8 text-base shadow-lg shadow-brand/10 transition-all"
            >
              <Download className="size-5" />
              {isCompiling ? "Compiling Output..." : "Compile Output"}
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
