"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Native range input styled like shadcn's slider (no extra dependency). */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onValueChange(Number(event.target.value))}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground",
        "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-600 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-600",
        className,
      )}
      style={{
        background: `linear-gradient(to right, #ff0033 ${percent}%, hsl(var(--muted)) ${percent}%)`,
      }}
    />
  );
}
