"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileDown, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  REPORT_ALLOCATION_COLUMN_KEYS,
  REPORT_METRIC_KEYS,
  REPORT_PARAMETER_KEYS,
  REPORT_RISK_HORIZON_KEYS,
  ReportAllocationColumnKey,
  ReportAvailability,
  ReportConfig,
  ReportMetricKey,
  ReportParameterKey,
  ReportRiskHorizonKey,
  ReportSectionKey,
  defaultReportConfig,
  hasReportContent,
  isChartSelected,
  setChartSelected,
} from "@/lib/report-config";
import { cn } from "@/lib/utils";

interface ReportChartOption {
  key: string;
  title: string;
}

interface ReportConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seeds the draft each time the dialog opens. */
  config: ReportConfig;
  availability: ReportAvailability;
  charts: ReportChartOption[];
  /** Shown as the title placeholder — the name the report falls back to. */
  defaultTitle: string;
  onGenerate: (config: ReportConfig) => void;
}

/**
 * Lets the user pick what the exported report contains before it is built.
 *
 * The dialog edits a draft, so closing it with Cancel or Escape leaves the
 * caller's config untouched; only "Generate" hands the choice back.
 */
export function ReportConfigDialog({
  open,
  onOpenChange,
  config,
  availability,
  charts,
  defaultTitle,
  onGenerate,
}: ReportConfigDialogProps) {
  const t = useTranslations("ReportConfig");
  const tResults = useTranslations("MarkowitzResults");
  const [draft, setDraft] = useState<ReportConfig>(config);
  const titleFieldId = useId();

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const isEmpty = !hasReportContent(draft, availability);

  const setSection = (key: ReportSectionKey, value: boolean) =>
    setDraft((current) => ({
      ...current,
      sections: { ...current.sections, [key]: value },
    }));

  const metricLabels: Record<ReportMetricKey, string> = {
    expectedReturn: tResults("expectedReturn"),
    volatility: tResults("volatility"),
    sharpeRatio: tResults("sharpeRatio"),
    probNeg1y: tResults("probNeg1y"),
  };

  const parameterLabels: Record<ReportParameterKey, string> = {
    dateRange: t("parameters.dateRange"),
    strategy: t("parameters.strategy"),
    constraints: t("parameters.constraints"),
    assets: t("parameters.assets"),
  };

  const allocationLabels: Record<ReportAllocationColumnKey, string> = {
    limits: tResults("tableLimits"),
    expectedReturn: tResults("tableExpReturn"),
    volatility: tResults("tableVolatility"),
    weight: tResults("tableWeight"),
  };

  const horizonLabels: Record<ReportRiskHorizonKey, string> = {
    m1: tResults("horizon1m"),
    m3: tResults("horizon3m"),
    y1: tResults("horizon1y"),
    y2: tResults("horizon2y"),
  };

  // The limits column only exists when the simulation ran with per-asset bands.
  const allocationColumnKeys = REPORT_ALLOCATION_COLUMN_KEYS.filter(
    (key) => key !== "limits" || availability.assetLimits
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                // The scrim darkens the page in both themes, so it is built from
                // `--scene-bg` (dark everywhere) rather than `--background`.
                className="fixed inset-0 z-50 bg-[hsl(var(--scene-bg)/0.45)] backdrop-blur-sm dark:bg-[hsl(var(--scene-bg)/0.7)]"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg dark:border-border/50 dark:shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4 dark:border-border/50">
                  <div>
                    <Dialog.Title className="font-display text-lg">
                      {t("title")}
                    </Dialog.Title>
                    <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                      {t("description")}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <X className="h-4 w-4" />
                    <span className="sr-only">{t("cancel")}</span>
                  </Dialog.Close>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={titleFieldId}
                      className="text-sm font-medium"
                    >
                      {t("reportTitleLabel")}
                    </label>
                    <input
                      id={titleFieldId}
                      type="text"
                      value={draft.title}
                      placeholder={defaultTitle}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  <SectionBlock
                    label={t("sections.metrics")}
                    hint={t("sections.metricsHint")}
                    checked={draft.sections.metrics}
                    onCheckedChange={(value) => setSection("metrics", value)}
                  >
                    <FieldGrid>
                      {REPORT_METRIC_KEYS.map((key) => (
                        <FieldCheckbox
                          key={key}
                          label={metricLabels[key]}
                          checked={draft.metrics[key]}
                          onCheckedChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              metrics: { ...current.metrics, [key]: value },
                            }))
                          }
                        />
                      ))}
                    </FieldGrid>
                    <FieldCheckbox
                      label={t("metrics.confidenceInterval")}
                      checked={draft.confidenceInterval}
                      disabled={!draft.metrics.expectedReturn}
                      onCheckedChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          confidenceInterval: value,
                        }))
                      }
                    />
                  </SectionBlock>

                  <SectionBlock
                    label={t("sections.parameters")}
                    hint={t("sections.parametersHint")}
                    checked={draft.sections.parameters}
                    onCheckedChange={(value) => setSection("parameters", value)}
                  >
                    <FieldGrid>
                      {REPORT_PARAMETER_KEYS.map((key) => (
                        <FieldCheckbox
                          key={key}
                          label={parameterLabels[key]}
                          checked={draft.parameters[key]}
                          onCheckedChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              parameters: {
                                ...current.parameters,
                                [key]: value,
                              },
                            }))
                          }
                        />
                      ))}
                    </FieldGrid>
                  </SectionBlock>

                  <SectionBlock
                    label={t("sections.allocation")}
                    hint={t("sections.allocationHint")}
                    checked={draft.sections.allocation}
                    onCheckedChange={(value) => setSection("allocation", value)}
                  >
                    <FieldGrid>
                      {allocationColumnKeys.map((key) => (
                        <FieldCheckbox
                          key={key}
                          label={allocationLabels[key]}
                          checked={draft.allocationColumns[key]}
                          onCheckedChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              allocationColumns: {
                                ...current.allocationColumns,
                                [key]: value,
                              },
                            }))
                          }
                        />
                      ))}
                    </FieldGrid>
                    <p className="text-[11px] text-muted-foreground">
                      {t("allocationNote")}
                    </p>
                  </SectionBlock>

                  <SectionBlock
                    label={t("sections.risk")}
                    hint={t("sections.riskHint")}
                    checked={draft.sections.risk}
                    onCheckedChange={(value) => setSection("risk", value)}
                  >
                    <FieldGrid>
                      {REPORT_RISK_HORIZON_KEYS.map((key) => (
                        <FieldCheckbox
                          key={key}
                          label={horizonLabels[key]}
                          checked={draft.riskHorizons[key]}
                          onCheckedChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              riskHorizons: {
                                ...current.riskHorizons,
                                [key]: value,
                              },
                            }))
                          }
                        />
                      ))}
                    </FieldGrid>
                  </SectionBlock>

                  {availability.comparison && (
                    <SectionBlock
                      label={t("sections.comparison")}
                      hint={t("sections.comparisonHint")}
                      checked={draft.sections.comparison}
                      onCheckedChange={(value) =>
                        setSection("comparison", value)
                      }
                    />
                  )}

                  {charts.length > 0 && (
                    <SectionBlock
                      label={t("sections.charts")}
                      hint={t("sections.chartsHint")}
                      checked={draft.sections.charts}
                      onCheckedChange={(value) => setSection("charts", value)}
                    >
                      <div className="space-y-2">
                        {charts.map((chart) => (
                          <FieldCheckbox
                            key={chart.key}
                            label={chart.title}
                            checked={isChartSelected(draft, chart.key)}
                            onCheckedChange={(value) =>
                              setDraft((current) =>
                                setChartSelected(current, chart.key, value)
                              )
                            }
                          />
                        ))}
                      </div>
                    </SectionBlock>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 dark:border-border/50">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...defaultReportConfig(),
                        title: current.title,
                      }))
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("reset")}
                  </button>

                  <div className="flex items-center gap-2">
                    {isEmpty && (
                      <p className="text-xs text-rose-500 dark:text-rose-400">
                        {t("emptyWarning")}
                      </p>
                    )}
                    <Dialog.Close className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      {t("cancel")}
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={isEmpty}
                      onClick={() => onGenerate(draft)}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FileDown className="h-4 w-4" />
                      {t("generate")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

interface SectionBlockProps {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  /** Field-level options, revealed only while the section is on. */
  children?: ReactNode;
}

function SectionBlock({
  label,
  hint,
  checked,
  onCheckedChange,
  children,
}: SectionBlockProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background/40 p-4 transition-colors dark:border-border/50 dark:bg-card/40",
        !checked && "opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch.Root
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={label}
          className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-muted outline-none transition-colors data-[state=checked]:bg-primary"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px] dark:bg-white dark:shadow-lg dark:ring-0" />
        </Switch.Root>
      </div>

      {children && checked && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 dark:border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

interface FieldCheckboxProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}

function FieldCheckbox({
  label,
  checked,
  disabled,
  onCheckedChange,
}: FieldCheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Checkbox.Indicator>
          <Check className="h-3 w-3 text-primary-foreground" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label
        htmlFor={id}
        className={cn(
          "cursor-pointer text-xs text-foreground",
          disabled && "cursor-not-allowed text-muted-foreground"
        )}
      >
        {label}
      </label>
    </div>
  );
}
