import { useNavigate } from 'react-router-dom';
import { X, Clock, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useScreenStore } from '../../stores/screenStore';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../ui/dialog';

export function ActiveScreenBar() {
  const navigate = useNavigate();
  const { activeScreen, clearActiveScreen } = useScreenStore();
  const [showExitDialog, setShowExitDialog] = useState(false);

  if (!activeScreen) return null;

  const deadlineDate = new Date(activeScreen.deadlineDate);
  const today = new Date();
  const daysLeft = Math.ceil(
    (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isUrgent = daysLeft <= 3;

  const handleExit = () => {
    clearActiveScreen();
    setShowExitDialog(false);
    navigate('/steps');
  };

  return (
    <>
      <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-2.5 bg-emerald-600/95 text-white text-sm font-medium shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur-sm z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-2 rounded-full bg-emerald-300 animate-pulse shrink-0" />
          <span className="font-semibold truncate">{activeScreen.screenName}</span>
          <span className="text-emerald-200/80 hidden sm:inline">·</span>
          <span className="text-emerald-100/80 truncate hidden sm:inline">
            {activeScreen.pipelineStep}
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 text-emerald-100/90">
            {isUrgent ? (
              <AlertCircle className="size-3.5 text-amber-300" />
            ) : (
              <Clock className="size-3.5" />
            )}
            <span className="text-xs tabular-nums">
              Deadline:{' '}
              {deadlineDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
              {daysLeft > 0 && (
                <span className={isUrgent ? 'text-amber-300 font-bold ml-1' : 'ml-1'}>
                  ({daysLeft}d left)
                </span>
              )}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-emerald-200 hover:text-white hover:bg-emerald-500/50"
            onClick={() => setShowExitDialog(true)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Exit confirmation */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exit Screen</DialogTitle>
            <DialogDescription>
              Are you sure you want to exit{' '}
              <strong className="text-foreground">{activeScreen.screenName}</strong>?
              Your progress is saved and you can resume later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={handleExit}
              className="bg-brand text-brand-fg hover:bg-brand-hover"
            >
              Yes, Exit Screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
