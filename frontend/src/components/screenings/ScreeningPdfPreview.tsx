import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface ScreeningPdfPreviewProps {
  src: string;
  open: boolean;
  onToggle: () => void;
  title?: string;
}

export function ScreeningPdfPreview({ src, open, onToggle, title = 'PDF Preview' }: ScreeningPdfPreviewProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-brand" />
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={onToggle}>
          {open ? <ChevronDown className="mr-1 size-4" /> : <ChevronRight className="mr-1 size-4" />}
          {open ? 'Hide preview' : 'Show preview'}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <iframe
              src={src}
              title={title}
              className="h-[720px] w-full"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
