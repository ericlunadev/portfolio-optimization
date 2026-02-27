"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

interface ConstraintsPanelProps {
  enforceFullInvestment: boolean;
  onEnforceFullInvestmentChange: (value: boolean) => void;
  allowShortSelling: boolean;
  onAllowShortSellingChange: (value: boolean) => void;
  useLeverage: boolean;
  onUseLeverageChange: (value: boolean) => void;
  maxLeverage: number;
  onMaxLeverageChange: (value: number) => void;
}

export function ConstraintsPanel({
  enforceFullInvestment,
  onEnforceFullInvestmentChange,
  allowShortSelling,
  onAllowShortSellingChange,
  useLeverage,
  onUseLeverageChange,
  maxLeverage,
  onMaxLeverageChange,
}: ConstraintsPanelProps) {
  return (
    <div className="space-y-5">
      {/* Full Investment Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium">Inversion Completa (100%)</label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Informacion sobre inversion completa"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 max-w-xs rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
                  sideOffset={5}
                  align="start"
                >
                  <div className="space-y-2">
                    <p className="font-semibold">Que significa esta restriccion?</p>
                    <p>
                      La restriccion de inversion completa obliga a que la suma de todos los pesos del portafolio sea exactamente <strong>100%</strong>. Es decir, todo el capital disponible debe estar invertido en los activos seleccionados.
                    </p>
                    <p className="font-semibold pt-1">Si desactivas esta opcion:</p>
                    <p>
                      El optimizador puede recomendar mantener una parte del capital en <strong>efectivo</strong> (no invertido). Esto es util cuando el modelo considera que mantener liquidez reduce el riesgo general del portafolio.
                    </p>
                    <p className="font-semibold pt-1">Cuando desactivarla?</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>En periodos de alta volatilidad del mercado</li>
                      <li>Cuando deseas una estrategia mas conservadora</li>
                      <li>Si prefieres que el modelo decida el nivel optimo de exposicion</li>
                    </ul>
                  </div>
                  <Popover.Arrow className="fill-border" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
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
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium">Permitir Ventas en Corto</label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Informacion sobre ventas en corto"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 max-w-xs rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
                  sideOffset={5}
                  align="start"
                >
                  <div className="space-y-2">
                    <p className="font-semibold">Que son las ventas en corto?</p>
                    <p>
                      Las ventas en corto permiten &quot;vender&quot; activos que no posees, apostando a que su precio bajara. En la optimizacion, esto se traduce en <strong>pesos negativos</strong> para ciertos activos.
                    </p>
                    <p className="font-semibold pt-1">Efecto en la optimizacion:</p>
                    <p>
                      Al permitir posiciones cortas, el optimizador tiene mas flexibilidad y puede encontrar portafolios con mayor rendimiento esperado o menor riesgo que solo con posiciones largas.
                    </p>
                    <p className="font-semibold pt-1">Consideraciones practicas:</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>Se requiere una cuenta de margen con tu broker</li>
                      <li>Implica costos de prestamo de acciones</li>
                      <li>El riesgo de perdida es teoricamente ilimitado</li>
                      <li>Puede haber requisitos de margen significativos</li>
                    </ul>
                  </div>
                  <Popover.Arrow className="fill-border" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
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

      {/* Leverage */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Apalancamiento</label>
            <p className="text-xs text-muted-foreground">
              Permite invertir mas del 100% del capital (usando margen)
            </p>
          </div>
          <Switch.Root
            checked={useLeverage}
            onCheckedChange={onUseLeverageChange}
            className="relative h-6 w-11 cursor-pointer rounded-full bg-muted outline-none transition-colors data-[state=checked]:bg-primary"
          >
            <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-lg transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>

        {useLeverage && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Apalancamiento maximo:</span>
              <span className="text-sm font-semibold text-primary">
                {(maxLeverage * 100).toFixed(0)}% ({maxLeverage.toFixed(1)}x)
              </span>
            </div>
            <Slider.Root
              className="relative flex h-5 w-full touch-none select-none items-center"
              value={[maxLeverage]}
              onValueChange={([v]) => onMaxLeverageChange(v)}
              min={1.0}
              max={3.0}
              step={0.1}
            >
              <Slider.Track className="relative h-2 w-full grow rounded-full bg-muted">
                <Slider.Range className="absolute h-full rounded-full bg-primary" />
              </Slider.Track>
              <Slider.Thumb
                className="block h-5 w-5 rounded-full bg-primary shadow-lg ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Apalancamiento maximo"
              />
            </Slider.Root>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>100% (1x)</span>
              <span>300% (3x)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
