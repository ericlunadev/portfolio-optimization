"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import { formatPercent } from "@/lib/utils";

interface ConstraintsPanelProps {
  enforceFullInvestment: boolean;
  onEnforceFullInvestmentChange: (value: boolean) => void;
  allowShortSelling: boolean;
  onAllowShortSellingChange: (value: boolean) => void;
  useVolatilityConstraint: boolean;
  onUseVolatilityConstraintChange: (value: boolean) => void;
  volMax: number;
  onVolMaxChange: (value: number) => void;
}

export function ConstraintsPanel({
  enforceFullInvestment,
  onEnforceFullInvestmentChange,
  allowShortSelling,
  onAllowShortSellingChange,
  useVolatilityConstraint,
  onUseVolatilityConstraintChange,
  volMax,
  onVolMaxChange,
}: ConstraintsPanelProps) {
  return (
    <div className="space-y-5">
      {/* Full Investment Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Inversion Completa (100%)</label>
          <p className="text-xs text-muted-foreground">
            La suma de los pesos debe ser exactamente 100%
          </p>
        </div>
        <Switch.Root
          checked={enforceFullInvestment}
          onCheckedChange={onEnforceFullInvestmentChange}
          className="relative h-6 w-11 cursor-pointer rounded-full bg-muted outline-none transition-colors data-[state=checked]:bg-primary"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-lg transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {/* Short Selling Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Permitir Ventas en Corto</label>
          <p className="text-xs text-muted-foreground">
            Permite pesos negativos (posiciones cortas)
          </p>
        </div>
        <Switch.Root
          checked={allowShortSelling}
          onCheckedChange={onAllowShortSellingChange}
          className="relative h-6 w-11 cursor-pointer rounded-full bg-muted outline-none transition-colors data-[state=checked]:bg-primary"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-lg transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {/* Volatility Constraint */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Volatilidad Maxima</label>
            <p className="text-xs text-muted-foreground">
              Limitar la volatilidad del portafolio
            </p>
          </div>
          <Switch.Root
            checked={useVolatilityConstraint}
            onCheckedChange={onUseVolatilityConstraintChange}
            className="relative h-6 w-11 cursor-pointer rounded-full bg-muted outline-none transition-colors data-[state=checked]:bg-primary"
          >
            <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-lg transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>

        {useVolatilityConstraint && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Volatilidad maxima:</span>
              <span className="text-sm font-semibold text-primary">
                {formatPercent(volMax)}
              </span>
            </div>
            <Slider.Root
              className="relative flex h-5 w-full touch-none select-none items-center"
              value={[volMax]}
              onValueChange={([v]) => onVolMaxChange(v)}
              min={0.05}
              max={0.50}
              step={0.01}
            >
              <Slider.Track className="relative h-2 w-full grow rounded-full bg-muted">
                <Slider.Range className="absolute h-full rounded-full bg-primary" />
              </Slider.Track>
              <Slider.Thumb
                className="block h-5 w-5 rounded-full bg-primary shadow-lg ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Volatilidad maxima"
              />
            </Slider.Root>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>5%</span>
              <span>50%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
