import * as React from "react"

import { cn } from "@/lib/utils"

interface SliderProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "min" | "max" | "step"
  > {
  className?: string
  defaultValue?: number[]
  value?: number[]
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number[]) => void
  onValueCommitted?: (value: number[]) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onValueChange,
  onValueCommitted,
  ...props
}: SliderProps) {
  const isControlled = Array.isArray(value)

  const [internalValue, setInternalValue] = React.useState(() => {
    const initial = Array.isArray(defaultValue) ? defaultValue[0] : min
    return Number.isFinite(initial) ? initial : min
  })

  const rawValue = isControlled ? value?.[0] : internalValue

  const safeValue =
    Number.isFinite(rawValue) && max > min
      ? clamp(Number(rawValue), min, max)
      : min

  const percent = max <= min ? 0 : ((safeValue - min) / (max - min)) * 100

  const updateValue = (nextValue: number) => {
    const next = clamp(nextValue, min, max)

    if (!isControlled) {
      setInternalValue(next)
    }

    onValueChange?.([next])
  }

  const commitValue = (nextValue: number) => {
    const next = clamp(nextValue, min, max)
    onValueCommitted?.([next])
  }

  return (
    <div
      className={cn(
        "relative flex w-full select-none items-center px-2 py-1",
        disabled && "opacity-50",
        className
      )}
      data-slot="slider"
      aria-disabled={disabled || undefined}
    >
      <div data-slot="slider-control" className="relative flex w-full items-center">
        <div
          data-slot="slider-track"
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            data-slot="slider-range"
            className="absolute left-0 top-0 h-full rounded-full bg-brand"
            style={{ width: `${percent}%` }}
          />
        </div>

        <input
          {...props}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled || max <= min}
          onChange={(event) => {
            updateValue(Number(event.currentTarget.value))
          }}
          onPointerUp={(event) => {
            commitValue(Number(event.currentTarget.value))
          }}
          onKeyUp={(event) => {
            if (
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "ArrowUp" ||
              event.key === "ArrowDown" ||
              event.key === "Home" ||
              event.key === "End" ||
              event.key === "PageUp" ||
              event.key === "PageDown"
            ) {
              commitValue(Number(event.currentTarget.value))
            }
          }}
          className="absolute inset-0 z-20 h-4 w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
        />

        <div
          data-slot="slider-thumb"
          className="pointer-events-none absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-sm"
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export { Slider }