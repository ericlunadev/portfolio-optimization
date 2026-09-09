"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import {
  BenchmarkCategory,
  BenchmarkComparisonResponse,
  isCustomBenchmarkId,
  type CustomBenchmark,
} from "@/lib/api";
import {
  useBenchmarkCatalog,
  useCreateCustomBenchmark,
  useDeleteCustomBenchmark,
  useUpdateCustomBenchmark,
} from "@/hooks/useBenchmarks";
import { CustomBenchmarkEditor } from "./CustomBenchmarkEditor";
import { buildBenchmarkChartData } from "@/lib/benchmark-chart";
import { CumulativeReturnsChart } from "@/components/charts/CumulativeReturnsChart";
import { ChartReveal } from "@/components/charts/ChartReveal";
import { formatChartDate, useChartColors } from "@/components/charts/chart-theme";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

/**
 * Order the picker groups its options in. The portfolio's own baseline leads,
 * since 1/N is the first thing an optimized result should be held against, and
 * the user's own benchmarks close the list.
 */
const CATEGORY_ORDER: BenchmarkCategory[] = [
  "portfolio",
  "equity",
  "global",
  "diversified",
  "custom",
];

/**
 * How many benchmarks can be compared at once. Beyond a handful the chart's
 * lines stop being tellable apart, and the palette runs out of distinct hues.
 */
export const MAX_BENCHMARKS = 6;

interface BenchmarkComparisonProps {
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  comparison?: BenchmarkComparisonResponse;
  isLoading: boolean;
  isError: boolean;
  /** Label for the optimized portfolio, shared with the rest of the results. */
  portfolioLabel: string;
  /** Colour assigned to each selected benchmark id, in selection order. */
  colorById: Record<string, string>;
  /** Localized display name for a benchmark id. */
  nameById: (id: string) => string;
}

export function BenchmarkComparison({
  selected,
  onSelectedChange,
  comparison,
  isLoading,
  isError,
  portfolioLabel,
  colorById,
  nameById,
}: BenchmarkComparisonProps) {
  const t = useTranslations("Benchmarks");
  const colors = useChartColors();
  const { data: catalog } = useBenchmarkCatalog();

  const createCustom = useCreateCustomBenchmark();
  const updateCustom = useUpdateCustomBenchmark();
  const deleteCustom = useDeleteCustomBenchmark();

  /** `"new"` while creating, a benchmark id while editing, null when closed. */
  const [editing, setEditing] = useState<string | null>(null);

  const groups = useMemo(() => {
    const entries = catalog?.benchmarks ?? [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      entries: entries.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0 || group.category === "custom");
  }, [catalog]);

  const atLimit = selected.length >= MAX_BENCHMARKS;

  const editingBenchmark: CustomBenchmark | undefined = useMemo(() => {
    if (!editing || editing === "new") return undefined;
    const entry = catalog?.benchmarks.find((candidate) => candidate.id === editing);
    if (!entry) return undefined;
    return { id: entry.id, name: entry.name ?? "", components: entry.components };
  }, [editing, catalog]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onSelectedChange(selected.filter((entry) => entry !== id));
    } else if (!atLimit) {
      onSelectedChange([...selected, id]);
    }
  }

  async function saveCustom(input: {
    name: string;
    components: { ticker: string; weight: number }[];
  }) {
    if (editingBenchmark) {
      await updateCustom.mutateAsync({ id: editingBenchmark.id, ...input });
    } else {
      // A benchmark the user just built is almost always one they want to see,
      // so it goes straight into the comparison — unless the picker is full.
      const created = await createCustom.mutateAsync(input);
      if (selected.length < MAX_BENCHMARKS) {
        onSelectedChange([...selected, created.id]);
      }
    }
    setEditing(null);
  }

  async function removeCustom(id: string) {
    await deleteCustom.mutateAsync(id);
    onSelectedChange(selected.filter((entry) => entry !== id));
    if (editing === id) setEditing(null);
  }

  // Keep the table and the chart in the order the user picked, not the order
  // the API happened to answer in.
  const rows = useMemo(() => {
    if (!comparison) return [];
    const byId = new Map(comparison.benchmarks.map((b) => [b.id, b]));
    return selected.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    });
  }, [comparison, selected]);

  const chart = useMemo(
    () =>
      buildBenchmarkChartData({
        comparison,
        selected,
        portfolioLabel,
        portfolioColor: colors.optimal,
        colorById,
        nameById,
      }),
    [comparison, selected, portfolioLabel, colors.optimal, colorById, nameById]
  );

  const unavailable = comparison?.unavailable ?? [];
  // Bound outside the JSX so the null check still holds inside the row map.
  const portfolio = comparison?.portfolio ?? null;

  return (
    <div className="glass-card p-4 md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-border/50 bg-accent/40 p-1.5 text-muted-foreground">
          <Scale className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 className="font-display text-lg">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <fieldset className="mb-5 space-y-3">
        <legend className="sr-only">{t("pickerLegend")}</legend>
        {groups.map((group) => (
          <div key={group.category}>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t(`category.${group.category}`)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.entries.map((entry) => {
                const isSelected = selected.includes(entry.id);
                const isDisabled = !isSelected && atLimit;
                const isCustom = isCustomBenchmarkId(entry.id);
                return (
                  <span
                    key={entry.id}
                    className={cn(
                      "inline-flex items-center rounded-full border text-xs font-medium transition-all",
                      isSelected
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/50 bg-card/60 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                      isDisabled && "opacity-40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(entry.id)}
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      // The equal-weight benchmark is the one entry with no
                      // fixed symbols to name, so it explains itself instead.
                      title={
                        entry.tickers.length > 0
                          ? entry.tickers.join(" · ")
                          : t("equalWeightHint")
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 py-1.5 pl-3",
                        isCustom ? "pr-1.5" : "pr-3",
                        isDisabled && "cursor-not-allowed"
                      )}
                    >
                      {isSelected && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: colorById[entry.id] }}
                          aria-hidden
                        />
                      )}
                      {nameById(entry.id)}
                    </button>
                    {isCustom && (
                      <span className="flex items-center gap-0.5 pr-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(entry.id)}
                          aria-label={t("custom.editAria", { name: nameById(entry.id) })}
                          className="rounded-full p-1 transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustom(entry.id)}
                          disabled={deleteCustom.isPending}
                          aria-label={t("custom.deleteAria", { name: nameById(entry.id) })}
                          className="rounded-full p-1 transition-colors hover:bg-accent hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    )}
                  </span>
                );
              })}
              {group.category === "custom" && (
                <button
                  type="button"
                  onClick={() => setEditing("new")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  {t("custom.add")}
                </button>
              )}
            </div>
            {group.category === "custom" && group.entries.length === 0 && !editing && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t("custom.empty")}</p>
            )}
          </div>
        ))}
        {atLimit && (
          <p className="text-xs text-muted-foreground">
            {t("maxSelected", { count: MAX_BENCHMARKS })}
          </p>
        )}
        {editing && (
          <CustomBenchmarkEditor
            key={editing}
            benchmark={editingBenchmark}
            onSave={saveCustom}
            onCancel={() => setEditing(null)}
            isSaving={createCustom.isPending || updateCustom.isPending}
            error={editingBenchmark ? updateCustom.error : createCustom.error}
          />
        )}
      </fieldset>

      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : isError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {t("error")}
        </p>
      ) : isLoading || !comparison ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </div>
      ) : (
        <div className="space-y-5">
          {unavailable.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
              {t("unavailable", {
                names: unavailable.map(nameById).join(", "),
              })}
            </p>
          )}

          {portfolio && rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">
                        {t("colPortfolio")}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t("colReturn")}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t("colVolatility")}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t("colSharpe")}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t("colDrawdown")}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t("colTotalReturn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50 bg-primary/5">
                      <td className="px-2 py-2 font-medium">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: colors.optimal }}
                            aria-hidden
                          />
                          {portfolioLabel}
                        </span>
                      </td>
                      <MetricCells performance={portfolio} />
                    </tr>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50">
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-2 font-medium">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: colorById[row.id] }}
                              aria-hidden
                            />
                            {nameById(row.id)}
                          </span>
                          <span className="ml-4 text-xs text-muted-foreground">
                            {row.tickers.join(" · ")}
                          </span>
                        </td>
                        <MetricCells
                          performance={row}
                          reference={portfolio}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {chart.data.length > 0 && (
                <div>
                  <div className="mb-3">
                    <h4 className="font-display text-base">{t("growthTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t("growthSubtitle", {
                        start: formatChartDate(comparison.window.start),
                        end: formatChartDate(comparison.window.end),
                      })}
                    </p>
                  </div>
                  <ChartReveal>
                    <CumulativeReturnsChart
                      data={chart.data}
                      series={chart.series}
                      highlightSeries={portfolioLabel}
                      seriesColors={chart.seriesColors}
                    />
                  </ChartReveal>
                </div>
              )}

              <p className="text-xs text-muted-foreground">{t("note")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface MetricCellsProps {
  performance: {
    expected_return: number;
    volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    total_return: number;
  };
  /**
   * When given, the return and Sharpe cells are tinted by how the row compares
   * against it — that is what makes the table readable at a glance.
   */
  reference?: MetricCellsProps["performance"];
}

function MetricCells({ performance, reference }: MetricCellsProps) {
  return (
    <>
      <td className={cn("px-2 py-2 text-right", compareClass(performance.expected_return, reference?.expected_return))}>
        {formatPercent(performance.expected_return)}
      </td>
      <td className="px-2 py-2 text-right">{formatPercent(performance.volatility)}</td>
      <td className={cn("px-2 py-2 text-right", compareClass(performance.sharpe_ratio, reference?.sharpe_ratio))}>
        {formatNumber(performance.sharpe_ratio, 2)}
      </td>
      <td className="px-2 py-2 text-right">{formatPercent(performance.max_drawdown)}</td>
      <td className="px-2 py-2 text-right">{formatPercent(performance.total_return)}</td>
    </>
  );
}

/**
 * Tints a benchmark's figure by whether it beat the portfolio. Green means the
 * benchmark came out ahead — the honest reading, even though it is the less
 * flattering one for the optimization.
 */
function compareClass(value: number, reference?: number): string | undefined {
  if (reference === undefined) return undefined;
  const difference = value - reference;
  if (Math.abs(difference) < 1e-9) return undefined;
  return difference > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-muted-foreground";
}
