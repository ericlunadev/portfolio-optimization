import { BenchmarkComparisonResponse } from "@/lib/api";

export interface BenchmarkChartData {
  /** One row per date, keyed by series name — the shape Recharts wants. */
  data: { date: string; [key: string]: string | number }[];
  series: string[];
  seriesColors: Record<string, string>;
}

const EMPTY: BenchmarkChartData = { data: [], series: [], seriesColors: {} };

/**
 * Pivots the portfolio and its benchmarks from one series per entity into one
 * row per date. Shared between the results page and the PDF export so the
 * captured chart is the same chart the user is looking at.
 *
 * Markets keep different holiday calendars, so a row can be missing a series;
 * the chart bridges those gaps rather than breaking the line.
 */
export function buildBenchmarkChartData(options: {
  comparison?: BenchmarkComparisonResponse;
  /** Benchmark ids in the order the user picked them. */
  selected: string[];
  portfolioLabel: string;
  portfolioColor: string;
  colorById: Record<string, string>;
  nameById: (id: string) => string;
}): BenchmarkChartData {
  const { comparison, selected, portfolioLabel, portfolioColor, colorById, nameById } =
    options;

  if (!comparison?.portfolio) return EMPTY;

  const byId = new Map(comparison.benchmarks.map((b) => [b.id, b]));
  const rows = selected.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
  if (rows.length === 0) return EMPTY;

  const named = [
    {
      name: portfolioLabel,
      color: portfolioColor,
      points: comparison.portfolio.series,
    },
    ...rows.map((row) => ({
      name: nameById(row.id),
      color: colorById[row.id],
      points: row.series,
    })),
  ];

  // Index rows by date so the merge stays linear in the number of points
  // rather than scanning every series once per date.
  const byDate = new Map<string, { date: string; [key: string]: string | number }>();
  for (const series of named) {
    for (const point of series.points) {
      let row = byDate.get(point.date);
      if (!row) {
        row = { date: point.date };
        byDate.set(point.date, row);
      }
      row[series.name] = point.value;
    }
  }

  return {
    data: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    series: named.map((series) => series.name),
    seriesColors: Object.fromEntries(named.map((s) => [s.name, s.color])),
  };
}
