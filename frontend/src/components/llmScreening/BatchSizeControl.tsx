import * as React from 'react';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { cn } from '../../lib/utils';

type BatchSizeControlProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBatchValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return clampNumber(Math.round(value), min, max);
}

export const BatchSizeControl = React.memo(function BatchSizeControl({
  value,
  onChange,
  min = 1,
  max = 50,
  step = 1,
  className,
}: BatchSizeControlProps) {
  const safeValue = normalizeBatchValue(value, min, max);
  const [draft, setDraft] = React.useState(String(safeValue));

  React.useEffect(() => {
    setDraft(String(safeValue));
  }, [safeValue]);

  const commitDraft = React.useCallback(() => {
    // Keep typing forgiving: allow empty/intermediate values while focused,
    // then clamp only when the user commits by blur/Enter.
    const parsed = Number(draft);
    const next = Number.isFinite(parsed)
      ? normalizeBatchValue(parsed, min, max)
      : safeValue;

    onChange(next);
    setDraft(String(next));
  }, [draft, min, max, onChange, safeValue]);

  const handleSliderChange = React.useCallback(
    (nextValue: number[]) => {
      const next = normalizeBatchValue(nextValue[0] ?? safeValue, min, max);
      onChange(next);
      setDraft(String(next));
    },
    [min, max, onChange, safeValue]
  );

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[safeValue]}
        onValueChange={handleSliderChange}
        className="min-w-0 flex-1"
      />

      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        inputMode="numeric"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitDraft();
            event.currentTarget.blur();
          }
        }}
        onWheel={(event) => event.currentTarget.blur()}
        className="h-8 w-[64px] shrink-0 rounded-md border bg-surface-0 text-center text-sm shadow-inner"
      />
    </div>
  );
});
