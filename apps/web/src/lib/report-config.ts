/**
 * What goes into the exported PDF report.
 *
 * The report is assembled from a fixed catalogue of sections, each with its own
 * set of fields. Everything is on by default: the config narrows the report, it
 * never adds anything the simulation does not already have. `ReportConfigDialog`
 * edits it, `buildSimulationPdf` reads it, and the last choice is remembered in
 * `localStorage` so a user who always wants the same report configures it once.
 */

export const REPORT_SECTION_KEYS = [
  "metrics",
  "parameters",
  "allocation",
  "risk",
  "comparison",
  "charts",
] as const;
export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export const REPORT_METRIC_KEYS = [
  "expectedReturn",
  "volatility",
  "sharpeRatio",
  "probNeg1y",
] as const;
export type ReportMetricKey = (typeof REPORT_METRIC_KEYS)[number];

export const REPORT_PARAMETER_KEYS = [
  "dateRange",
  "strategy",
  "constraints",
  "assets",
] as const;
export type ReportParameterKey = (typeof REPORT_PARAMETER_KEYS)[number];

/** The asset name column is the row label, so it is not selectable. */
export const REPORT_ALLOCATION_COLUMN_KEYS = [
  "limits",
  "expectedReturn",
  "volatility",
  "weight",
] as const;
export type ReportAllocationColumnKey =
  (typeof REPORT_ALLOCATION_COLUMN_KEYS)[number];

export const REPORT_RISK_HORIZON_KEYS = ["m1", "m3", "y1", "y2"] as const;
export type ReportRiskHorizonKey = (typeof REPORT_RISK_HORIZON_KEYS)[number];

export interface ReportConfig {
  /** Empty means "use the simulation name". */
  title: string;
  sections: Record<ReportSectionKey, boolean>;
  metrics: Record<ReportMetricKey, boolean>;
  /** The 95% confidence interval printed under the expected return card. */
  confidenceInterval: boolean;
  parameters: Record<ReportParameterKey, boolean>;
  allocationColumns: Record<ReportAllocationColumnKey, boolean>;
  riskHorizons: Record<ReportRiskHorizonKey, boolean>;
  /**
   * Keyed by `PdfChartSpec.key`. Which charts exist depends on the simulation,
   * so a key that is absent counts as selected — a chart added later is opted
   * into rather than silently dropped from a stored config.
   */
  charts: Record<string, boolean>;
}

function allTrue<K extends string>(keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((key) => [key, true])) as Record<
    K,
    boolean
  >;
}

export function defaultReportConfig(): ReportConfig {
  return {
    title: "",
    sections: allTrue(REPORT_SECTION_KEYS),
    metrics: allTrue(REPORT_METRIC_KEYS),
    confidenceInterval: true,
    parameters: allTrue(REPORT_PARAMETER_KEYS),
    allocationColumns: allTrue(REPORT_ALLOCATION_COLUMN_KEYS),
    riskHorizons: allTrue(REPORT_RISK_HORIZON_KEYS),
    charts: {},
  };
}

/** A chart with no stored preference is included. */
export function isChartSelected(config: ReportConfig, key: string): boolean {
  return config.charts[key] !== false;
}

export function setChartSelected(
  config: ReportConfig,
  key: string,
  selected: boolean
): ReportConfig {
  return { ...config, charts: { ...config.charts, [key]: selected } };
}

/** Which options this particular simulation can actually offer. */
export interface ReportAvailability {
  /** The user supplied their own allocation, so optimal-vs-user can be drawn. */
  comparison: boolean;
  /** The simulation ran with per-asset min/max weights. */
  assetLimits: boolean;
  /** Chart keys available for this simulation, in report order. */
  chartKeys: string[];
}

/**
 * True when the configured report would still contain something. A report with
 * every section switched off is just a cover page, so the dialog blocks it.
 */
export function hasReportContent(
  config: ReportConfig,
  availability: ReportAvailability
): boolean {
  const { sections } = config;
  if (sections.metrics && REPORT_METRIC_KEYS.some((k) => config.metrics[k])) {
    return true;
  }
  if (
    sections.parameters &&
    REPORT_PARAMETER_KEYS.some((k) => config.parameters[k])
  ) {
    return true;
  }
  if (sections.allocation) return true;
  if (
    sections.risk &&
    REPORT_RISK_HORIZON_KEYS.some((k) => config.riskHorizons[k])
  ) {
    return true;
  }
  if (sections.comparison && availability.comparison) return true;
  if (
    sections.charts &&
    availability.chartKeys.some((key) => isChartSelected(config, key))
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "portfolio:report-config:v1";

function mergeFlags<K extends string>(
  defaults: Record<K, boolean>,
  raw: unknown
): Record<K, boolean> {
  if (typeof raw !== "object" || raw === null) return defaults;
  const source = raw as Record<string, unknown>;
  const merged = { ...defaults };
  (Object.keys(defaults) as K[]).forEach((key) => {
    if (typeof source[key] === "boolean") merged[key] = source[key] as boolean;
  });
  return merged;
}

/**
 * Rebuilds a config from untrusted JSON, keeping only known keys of the right
 * type. Anything missing falls back to the default, so a config stored before a
 * new field existed still opens.
 */
export function normalizeReportConfig(raw: unknown): ReportConfig {
  const defaults = defaultReportConfig();
  if (typeof raw !== "object" || raw === null) return defaults;
  const source = raw as Record<string, unknown>;

  const charts: Record<string, boolean> = {};
  if (typeof source.charts === "object" && source.charts !== null) {
    Object.entries(source.charts as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (typeof value === "boolean") charts[key] = value;
      }
    );
  }

  return {
    title: typeof source.title === "string" ? source.title : defaults.title,
    sections: mergeFlags(defaults.sections, source.sections),
    metrics: mergeFlags(defaults.metrics, source.metrics),
    confidenceInterval:
      typeof source.confidenceInterval === "boolean"
        ? source.confidenceInterval
        : defaults.confidenceInterval,
    parameters: mergeFlags(defaults.parameters, source.parameters),
    allocationColumns: mergeFlags(
      defaults.allocationColumns,
      source.allocationColumns
    ),
    riskHorizons: mergeFlags(defaults.riskHorizons, source.riskHorizons),
    charts,
  };
}

/** The report title belongs to one simulation, so it is never carried over. */
export function loadReportConfig(): ReportConfig {
  if (typeof window === "undefined") return defaultReportConfig();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultReportConfig();
    return { ...normalizeReportConfig(JSON.parse(stored)), title: "" };
  } catch {
    return defaultReportConfig();
  }
}

export function saveReportConfig(config: ReportConfig): void {
  if (typeof window === "undefined") return;
  try {
    const { title: _title, ...persisted } = config;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // A full or blocked storage must not stop the export.
  }
}
