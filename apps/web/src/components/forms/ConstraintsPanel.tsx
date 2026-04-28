"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Forms.Constraints");
  return (
    <div className="space-y-5">
      {/* Full Investment Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium">{t("fullInvestmentLabel")}</label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("fullInvestmentInfoAria")}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 w-[calc(100vw-2rem)] max-w-xs rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
                  sideOffset={5}
                  align="start"
                >
                  <div className="space-y-2">
                    <p className="font-semibold">{t("fullInvestmentTitle")}</p>
                    <p>
                      {t("fullInvestmentBody1Pre")}<strong>{t("fullInvestmentBody1Strong")}</strong>{t("fullInvestmentBody1Post")}
                    </p>
                    <p className="font-semibold pt-1">{t("fullInvestmentDeactivateTitle")}</p>
                    <p>
                      {t("fullInvestmentBody2Pre")}<strong>{t("fullInvestmentBody2Strong")}</strong>{t("fullInvestmentBody2Post")}
                    </p>
                    <p className="font-semibold pt-1">{t("fullInvestmentWhenTitle")}</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>{t("fullInvestmentWhen1")}</li>
                      <li>{t("fullInvestmentWhen2")}</li>
                      <li>{t("fullInvestmentWhen3")}</li>
                    </ul>
                  </div>
                  <Popover.Arrow className="fill-border" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("fullInvestmentHelp")}
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
            <label className="text-sm font-medium">{t("shortSellingLabel")}</label>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("shortSellingInfoAria")}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 w-[calc(100vw-2rem)] max-w-xs rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
                  sideOffset={5}
                  align="start"
                >
                  <div className="space-y-2">
                    <p className="font-semibold">{t("shortSellingTitle")}</p>
                    <p>
                      {t("shortSellingBody1Pre")}<strong>{t("shortSellingBody1Strong")}</strong>{t("shortSellingBody1Post")}
                    </p>
                    <p className="font-semibold pt-1">{t("shortSellingEffectTitle")}</p>
                    <p>
                      {t("shortSellingBody2")}
                    </p>
                    <p className="font-semibold pt-1">{t("shortSellingPracticalTitle")}</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>{t("shortSellingPractical1")}</li>
                      <li>{t("shortSellingPractical2")}</li>
                      <li>{t("shortSellingPractical3")}</li>
                      <li>{t("shortSellingPractical4")}</li>
                    </ul>
                  </div>
                  <Popover.Arrow className="fill-border" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("shortSellingHelp")}
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
            <label className="text-sm font-medium">{t("leverageLabel")}</label>
            <p className="text-xs text-muted-foreground">
              {t("leverageHelp")}
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
              <span className="text-sm text-muted-foreground">{t("maxLeverageLabel")}</span>
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
                aria-label={t("maxLeverageAria")}
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
