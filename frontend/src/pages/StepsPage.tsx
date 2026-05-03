import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardList, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { PageHeader } from '../components/layout/PageHeader';

export function StepsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-1">
      <PageHeader title="Steps" />

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full text-center space-y-10">
          {/* Hero icon cluster */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="size-24 rounded-3xl bg-gradient-to-br from-brand/20 to-brand/5 flex items-center justify-center shadow-lg shadow-brand/10 ring-1 ring-brand/10">
                <ClipboardList className="size-12 text-brand" />
              </div>
              <div className="absolute -top-2 -right-2 size-8 rounded-xl bg-brand/15 flex items-center justify-center animate-pulse">
                <Sparkles className="size-4 text-brand" />
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-foreground tracking-tight">
              Welcome to Company Screener
            </h2>
            <p className="text-base text-text-secondary leading-relaxed max-w-md mx-auto">
              Start a new investment screening or continue an existing one. Each screen walks you through 
              criteria analysis, keyword search, and LLM-powered evaluation.
            </p>
          </div>

          {/* CTA */}
          <Button
            onClick={() => navigate('/start-screening')}
            className="h-14 px-10 text-lg font-semibold bg-brand text-brand-fg hover:bg-brand-hover shadow-lg shadow-brand/20 gap-3 rounded-xl transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/30"
          >
            Start Screening
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
