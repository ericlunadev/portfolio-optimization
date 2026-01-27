"use client";

import * as Slider from "@radix-ui/react-slider";
import { formatPercent } from "@/lib/utils";

interface ReturnSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label?: string;
}

export function ReturnSlider({
  min,
  max,
  value,
  onChange,
  step = 0.01,
  label = "Rendimiento Requerido",
}: ReturnSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-semibold text-primary">
          {formatPercent(value)}
        </span>
      </div>

      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      >
        <Slider.Track className="relative h-2 w-full grow rounded-full bg-muted">
          <Slider.Range className="absolute h-full rounded-full bg-primary" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-5 w-5 rounded-full bg-primary shadow-lg ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={label}
        />
      </Slider.Root>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatPercent(min)}</span>
        <span>{formatPercent(max)}</span>
      </div>
    </div>
  );
}
