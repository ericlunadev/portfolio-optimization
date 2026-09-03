import type { jsPDF } from "jspdf";
import type { OptimizationResultWithStrategy, SimulationParams } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/utils";
import { formatWeightLimits } from "@/lib/asset-limits";
import {
  REPORT_METRIC_KEYS,
  ReportConfig,
  defaultReportConfig,
} from "@/lib/report-config";
import { deriveTenantPalette, type TenantPdfColors } from "@/lib/tenant-palette";

/**
 * Builds the "export simulation to PDF" report.
 *
 * Charts arrive pre-rasterized (see `svg-to-png`); everything else is drawn as
 * real vector text so the numbers stay selectable and searchable in the PDF.
 * The palette mirrors the dark app theme because the charts are painted for a
 * dark background and would be unreadable on white.
 *
 * This is the artifact that leaves the building — the file a tenant's analyst
 * emails to their own client — so its gold comes from `deriveTenantPalette`
 * rather than from constants of its own. `buildSimulationPdf` runs in the
 * browser (`await import("jspdf")` below), so the tenant's brand arrives on
 * `input.branding` as client props: nothing here can fetch it, and a logo has to
 * come in as a data URI rather than a URL.
 *
 * Which sections and fields are drawn comes from the `ReportConfig` the user
 * picked in the export dialog; every section can be left out, so each one is
 * responsible for drawing nothing at all — heading included — when it is empty.
 */

// A4 portrait, millimetres.
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 12;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

/** How tall a tenant logo is drawn, and how wide it is allowed to get. */
const LOGO_HEIGHT = 9;
const LOGO_MAX_WIDTH = 55;

/** Points to millimetres. */
const PT_TO_MM = 0.3528;

/**
 * The tenant brand a report is painted in.
 *
 * Threaded in as props rather than fetched: this module runs in the browser,
 * after the export button is pressed, with no session and no server to ask.
 */
export interface SimulationPdfBranding {
  /** The tenant's single accent (D9). Missing or unparseable falls back to ours. */
  accentHex?: string | null;
  /** `organization.tier` — only `"cobranded"` gets the "Powered by" line (D14). */
  tier?: string | null;
  /** A data URI: `doc.addImage` cannot fetch a URL, and the report is offline by then. */
  logo?: { dataUrl: string; width: number; height: number } | null;
}

export interface PdfChartImage {
  title: string;
  subtitle?: string;
  dataUrl: string;
  /** Source pixel dimensions, used to preserve aspect ratio. */
  width: number;
  height: number;
  legend?: { label: string; color: string }[];
}

export interface SimulationPdfLabels {
  documentTitle: string;
  generatedAtLabel: string;
  parametersHeading: string;
  allocationHeading: string;
  riskHeading: string;
  comparisonHeading: string;
  expectedReturn: string;
  volatility: string;
  sharpeRatio: string;
  probNeg1y: string;
  ci95Label: string;
  notAvailable: string;
  dateRange: string;
  strategy: string;
  riskFreeRate: string;
  targetReturn: string;
  targetRisk: string;
  fullInvestment: string;
  shortSelling: string;
  shortSellingAllowed: string;
  shortSellingNotAllowed: string;
  maxLeverage: string;
  maxWeightPerAsset: string;
  assets: string;
  yes: string;
  no: string;
  tableAsset: string;
  tableExpReturn: string;
  tableVolatility: string;
  tableWeight: string;
  /** Header for the per-asset min/max weight column. */
  tableLimits: string;
  horizonHeader: string;
  probabilityHeader: string;
  horizon1m: string;
  horizon3m: string;
  horizon1y: string;
  horizon2y: string;
  compareOptimal: string;
  compareUserAlloc: string;
  compareReturnLabel: string;
  compareVolatilityLabel: string;
  compareDisclaimer: string;
  disclaimer: string;
  /**
   * "Powered by <our product>", already composed. Optional because it is only
   * ever drawn for a co-branded tenant (D14) — see `drawFooters`.
   */
  poweredBy?: string;
  formatPage: (current: number, total: number) => string;
}

export interface SimulationPdfInput {
  /** Simulation name, used as the report heading. */
  title: string;
  strategyLabel: string;
  generatedAt: Date;
  params: SimulationParams;
  result: OptimizationResultWithStrategy;
  /** Present only when the user supplied their own allocation. */
  userPortfolio: { expectedReturn: number; volatility: number } | null;
  charts: PdfChartImage[];
  labels: SimulationPdfLabels;
  /** Sections and fields the user selected. Defaults to the full report. */
  config?: ReportConfig;
  /** The tenant's brand. Absent means our own. */
  branding?: SimulationPdfBranding;
}

/**
 * D14's only difference in code: a co-branded tenant carries our name in the
 * footer, a full-whitelabel one carries nothing of ours. Anything else —
 * including no tenant at all, which is the D2C product — is our own report and
 * has no one to credit.
 */
export function showsPoweredBy(branding: SimulationPdfBranding | undefined): boolean {
  return branding?.tier === "cobranded";
}

export async function buildSimulationPdf(
  input: SimulationPdfInput
): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "mm", format: "a4", compress: true });

  const config = input.config ?? defaultReportConfig();
  const { sections } = config;
  const colors = deriveTenantPalette(input.branding?.accentHex).pdf;

  const ctx: DrawContext = { doc, y: MARGIN, colors };
  paintPageBackground(doc, colors);

  drawHeader(ctx, input);
  if (sections.metrics) drawMetrics(ctx, input, config);
  if (sections.parameters) drawParameters(ctx, input, config);
  if (sections.allocation) drawAllocationTable(ctx, input, config);
  if (sections.risk) drawRiskTable(ctx, input, config);
  if (sections.comparison && input.userPortfolio) drawComparison(ctx, input);
  if (sections.charts) drawCharts(ctx, input);
  drawFooters(doc, input.labels, colors, showsPoweredBy(input.branding));

  return doc;
}

/** Sanitizes a simulation name into a filesystem-friendly PDF filename. */
export function simulationPdfFilename(title: string, generatedAt: Date): string {
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "simulation";
  const date = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, "0"),
    String(generatedAt.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slug}-${date}.pdf`;
}

/** DD/MM/YYYY, per the project-wide date format. */
export function formatReportDate(date: Date): string {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

interface DrawContext {
  doc: jsPDF;
  y: number;
  /** Derived once per report from the tenant accent, then carried everywhere. */
  colors: TenantPdfColors;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function setFill(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setStroke(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setText(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function paintPageBackground(doc: jsPDF, colors: TenantPdfColors): void {
  setFill(doc, colors.background);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
}

function newPage(ctx: DrawContext): void {
  ctx.doc.addPage();
  paintPageBackground(ctx.doc, ctx.colors);
  ctx.y = MARGIN;
}

/** Starts a new page when `height` would overflow the printable area. */
function ensureSpace(ctx: DrawContext, height: number): void {
  if (ctx.y + height > PAGE_BOTTOM) newPage(ctx);
}

function lineHeight(fontSize: number): number {
  return fontSize * PT_TO_MM * 1.18;
}

function drawSectionHeading(ctx: DrawContext, text: string): void {
  ensureSpace(ctx, 14);
  const { doc } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, ctx.colors.gold);
  doc.text(text.toUpperCase(), MARGIN, ctx.y, { baseline: "top" });
  ctx.y += lineHeight(10) + 1.5;

  setStroke(doc, ctx.colors.border);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, ctx.y, MARGIN + CONTENT_WIDTH, ctx.y);
  ctx.y += 4;
}

interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right";
}

function drawTable(
  ctx: DrawContext,
  columns: TableColumn[],
  rows: string[][],
  options: { highlightLastColumn?: boolean } = {}
): void {
  const { doc } = ctx;
  const rowHeight = 7;

  const drawHeaderRow = () => {
    ensureSpace(ctx, rowHeight * 2);
    setFill(doc, ctx.colors.surface);
    doc.rect(MARGIN, ctx.y, CONTENT_WIDTH, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, ctx.colors.muted);
    let x = MARGIN + 3;
    columns.forEach((column) => {
      const isRight = column.align === "right";
      doc.text(column.header, isRight ? x + column.width - 6 : x, ctx.y + 2.3, {
        baseline: "top",
        align: isRight ? "right" : "left",
      });
      x += column.width;
    });
    ctx.y += rowHeight;
  };

  drawHeaderRow();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  rows.forEach((row) => {
    if (ctx.y + rowHeight > PAGE_BOTTOM) {
      newPage(ctx);
      drawHeaderRow();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    let x = MARGIN + 3;
    columns.forEach((column, index) => {
      const isRight = column.align === "right";
      const isHighlighted =
        options.highlightLastColumn && index === columns.length - 1;
      setText(doc, isHighlighted ? ctx.colors.goldSoft : ctx.colors.text);
      doc.setFont("helvetica", isHighlighted ? "bold" : "normal");
      const cell = truncateToWidth(doc, row[index] ?? "", column.width - 6);
      doc.text(cell, isRight ? x + column.width - 6 : x, ctx.y + 2.1, {
        baseline: "top",
        align: isRight ? "right" : "left",
      });
      x += column.width;
    });

    ctx.y += rowHeight;
    setStroke(doc, ctx.colors.border);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, ctx.y, MARGIN + CONTENT_WIDTH, ctx.y);
  });

  ctx.y += 5;
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}...`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function drawHeader(ctx: DrawContext, input: SimulationPdfInput): void {
  const { doc } = ctx;
  const { labels } = input;

  const logo = input.branding?.logo;
  if (logo) {
    // Height-locked so every tenant's mark occupies the same optical weight,
    // and width-capped so a wide wordmark cannot run into the page edge.
    const width = Math.min((LOGO_HEIGHT * logo.width) / logo.height, LOGO_MAX_WIDTH);
    const height = (width * logo.height) / logo.width;
    doc.addImage(logo.dataUrl, MARGIN, ctx.y, width, height);
    ctx.y += height + 4;
  } else {
    setFill(doc, ctx.colors.gold);
    doc.rect(MARGIN, ctx.y, 22, 1, "F");
    ctx.y += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, ctx.colors.muted);
  doc.text(labels.documentTitle.toUpperCase(), MARGIN, ctx.y, {
    baseline: "top",
  });
  ctx.y += lineHeight(8.5) + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setText(doc, ctx.colors.text);
  const titleLines = doc.splitTextToSize(input.title, CONTENT_WIDTH);
  titleLines.forEach((line: string) => {
    doc.text(line, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(19);
  });
  ctx.y += 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, ctx.colors.muted);
  const subtitle = `${input.strategyLabel}   ·   ${formatDateRange(input.params)}`;
  doc.text(subtitle, MARGIN, ctx.y, { baseline: "top" });
  ctx.y += lineHeight(9.5);

  doc.setFontSize(8.5);
  doc.text(
    `${labels.generatedAtLabel}: ${formatReportDate(input.generatedAt)}`,
    MARGIN,
    ctx.y,
    { baseline: "top" }
  );
  ctx.y += lineHeight(8.5) + 6;
}

function drawMetrics(
  ctx: DrawContext,
  input: SimulationPdfInput,
  config: ReportConfig
): void {
  const { doc } = ctx;
  const { labels, result } = input;

  const cardsByKey = {
    expectedReturn: {
      label: labels.expectedReturn,
      value: formatPercent(result.expected_return),
      hint: config.confidenceInterval
        ? `${labels.ci95Label}: ${formatPercent(result.stats.ci_95_low)} / ${formatPercent(result.stats.ci_95_high)}`
        : "",
    },
    volatility: {
      label: labels.volatility,
      value: formatPercent(result.volatility),
      hint: "",
    },
    sharpeRatio: {
      label: labels.sharpeRatio,
      value:
        result.sharpe_ratio != null
          ? formatNumber(result.sharpe_ratio, 2)
          : labels.notAvailable,
      hint: "",
    },
    probNeg1y: {
      label: labels.probNeg1y,
      value: formatPercent(result.stats.prob_neg_1y),
      hint: "",
    },
  };

  const cards = REPORT_METRIC_KEYS.filter((key) => config.metrics[key]).map(
    (key) => cardsByKey[key]
  );
  if (cards.length === 0) return;

  const gap = 3;
  // Cards keep a sane width when only one or two metrics are selected: a single
  // card stretched across the page reads as a broken layout, not as a headline.
  const MAX_CARD_WIDTH = 60;
  const cardWidth = Math.min(
    (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length,
    MAX_CARD_WIDTH
  );
  const cardHeight = 24;

  ensureSpace(ctx, cardHeight + 4);

  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    setFill(doc, ctx.colors.surface);
    setStroke(doc, ctx.colors.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, ctx.y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, ctx.colors.muted);
    doc.text(truncateToWidth(doc, card.label, cardWidth - 6), x + 3, ctx.y + 4, {
      baseline: "top",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(doc, ctx.colors.goldSoft);
    doc.text(card.value, x + 3, ctx.y + 10, { baseline: "top" });

    if (card.hint) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      setText(doc, ctx.colors.muted);
      doc.text(truncateToWidth(doc, card.hint, cardWidth - 6), x + 3, ctx.y + 18, {
        baseline: "top",
      });
    }
  });

  ctx.y += cardHeight + 8;
}

function drawParameters(
  ctx: DrawContext,
  input: SimulationPdfInput,
  config: ReportConfig
): void {
  const { doc } = ctx;
  const { labels, params } = input;
  const fields = config.parameters;

  const entries: [string, string][] = [];

  if (fields.dateRange) {
    entries.push([labels.dateRange, formatDateRange(params)]);
  }

  // The strategy and the knob that tunes it (risk-free rate, target return or
  // target risk) are one choice, so they travel together.
  if (fields.strategy) {
    entries.push([labels.strategy, input.strategyLabel]);
    if (params.strategy === "max-sharpe") {
      entries.push([labels.riskFreeRate, formatPercent(params.riskFreeRate, 3)]);
    }
    if (
      params.strategy === "target-return" &&
      params.targetReturn !== undefined
    ) {
      entries.push([labels.targetReturn, formatPercent(params.targetReturn, 1)]);
    }
    if (params.strategy === "target-risk" && params.targetRisk !== undefined) {
      entries.push([labels.targetRisk, formatPercent(params.targetRisk, 1)]);
    }
  }

  if (fields.constraints) {
    entries.push([
      labels.fullInvestment,
      params.enforceFullInvestment ? labels.yes : labels.no,
    ]);
    entries.push([
      labels.shortSelling,
      params.allowShortSelling
        ? labels.shortSellingAllowed
        : labels.shortSellingNotAllowed,
    ]);
    if (params.useLeverage) {
      entries.push([
        labels.maxLeverage,
        `${formatPercent(params.maxLeverage, 0)} (${formatNumber(params.maxLeverage, 1)}x)`,
      ]);
    }
    if (params.assetConstraints) {
      entries.push([
        labels.maxWeightPerAsset,
        `${Math.round(params.wMax * 100)}%`,
      ]);
    }
  }

  if (entries.length === 0 && !fields.assets) return;

  drawSectionHeading(ctx, labels.parametersHeading);

  const columnWidth = CONTENT_WIDTH / 2;
  const rowHeight = 9;

  for (let i = 0; i < entries.length; i += 2) {
    ensureSpace(ctx, rowHeight);
    const pair = entries.slice(i, i + 2);
    pair.forEach(([label, value], column) => {
      const x = MARGIN + column * columnWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, ctx.colors.muted);
      doc.text(label, x, ctx.y, { baseline: "top" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setText(doc, ctx.colors.text);
      doc.text(truncateToWidth(doc, value, columnWidth - 4), x, ctx.y + 3.4, {
        baseline: "top",
      });
    });
    ctx.y += rowHeight;
  }

  if (!fields.assets) {
    ctx.y += 6;
    return;
  }

  ctx.y += 2;
  ensureSpace(ctx, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setText(doc, ctx.colors.muted);
  doc.text(labels.assets, MARGIN, ctx.y, { baseline: "top" });
  ctx.y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, ctx.colors.text);
  const tickerLines = doc.splitTextToSize(
    params.tickers.join("  ·  "),
    CONTENT_WIDTH
  );
  tickerLines.forEach((line: string) => {
    ensureSpace(ctx, lineHeight(9));
    doc.text(line, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(9);
  });

  ctx.y += 6;
}

function drawAllocationTable(
  ctx: DrawContext,
  input: SimulationPdfInput,
  config: ReportConfig
): void {
  const { labels, result, params } = input;
  const selected = config.allocationColumns;

  // With per-asset limits on, the assigned weight only makes sense next to the
  // band it had to fall in, so the table can grow a limits column.
  const showLimits = !!params.assetLimits && selected.limits;

  const numericColumns: {
    header: string;
    cell: (index: number) => string;
  }[] = [];

  if (showLimits) {
    numericColumns.push({
      header: labels.tableLimits,
      cell: (index) =>
        formatWeightLimits(params.assets[index], { ascii: true }) ??
        labels.notAvailable,
    });
  }
  if (selected.expectedReturn) {
    numericColumns.push({
      header: labels.tableExpReturn,
      cell: (index) => formatPercent(result.weights[index].exp_ret),
    });
  }
  if (selected.volatility) {
    numericColumns.push({
      header: labels.tableVolatility,
      cell: (index) => formatPercent(result.weights[index].volatility),
    });
  }
  if (selected.weight) {
    numericColumns.push({
      header: labels.tableWeight,
      cell: (index) => formatPercent(result.weights[index].weight),
    });
  }

  drawSectionHeading(ctx, labels.allocationHeading);

  // Numeric columns share a fixed slice each and the asset name takes the rest,
  // so dropping a column widens the names instead of leaving a gap.
  const numericWidth = numericColumns.length >= 4 ? 0.18 : 0.2;
  const assetWidth = 1 - numericColumns.length * numericWidth;

  drawTable(
    ctx,
    [
      { header: labels.tableAsset, width: CONTENT_WIDTH * assetWidth },
      ...numericColumns.map((column) => ({
        header: column.header,
        width: CONTENT_WIDTH * numericWidth,
        align: "right" as const,
      })),
    ],
    result.weights.map((weight, index) => [
      weight.fund_name,
      ...numericColumns.map((column) => column.cell(index)),
    ]),
    // The weight is the answer the report exists for, so it stays emphasised —
    // but only while it is actually the last column.
    { highlightLastColumn: selected.weight }
  );
}

function drawRiskTable(
  ctx: DrawContext,
  input: SimulationPdfInput,
  config: ReportConfig
): void {
  const { labels, result } = input;
  const horizons = config.riskHorizons;

  const rows: string[][] = [];
  if (horizons.m1) {
    rows.push([labels.horizon1m, formatPercent(result.stats.prob_neg_1m)]);
  }
  if (horizons.m3) {
    rows.push([labels.horizon3m, formatPercent(result.stats.prob_neg_3m)]);
  }
  if (horizons.y1) {
    rows.push([labels.horizon1y, formatPercent(result.stats.prob_neg_1y)]);
  }
  if (horizons.y2) {
    rows.push([labels.horizon2y, formatPercent(result.stats.prob_neg_2y)]);
  }
  if (rows.length === 0) return;

  drawSectionHeading(ctx, labels.riskHeading);

  drawTable(
    ctx,
    [
      { header: labels.horizonHeader, width: CONTENT_WIDTH * 0.6 },
      {
        header: labels.probabilityHeader,
        width: CONTENT_WIDTH * 0.4,
        align: "right",
      },
    ],
    rows
  );
}

function drawComparison(ctx: DrawContext, input: SimulationPdfInput): void {
  const { doc } = ctx;
  const { labels, result, userPortfolio } = input;
  if (!userPortfolio) return;

  drawSectionHeading(ctx, labels.comparisonHeading);

  drawTable(
    ctx,
    [
      { header: "", width: CONTENT_WIDTH * 0.4 },
      {
        header: labels.compareOptimal,
        width: CONTENT_WIDTH * 0.3,
        align: "right",
      },
      {
        header: labels.compareUserAlloc,
        width: CONTENT_WIDTH * 0.3,
        align: "right",
      },
    ],
    [
      [
        labels.compareReturnLabel,
        formatPercent(result.expected_return),
        formatPercent(userPortfolio.expectedReturn),
      ],
      [
        labels.compareVolatilityLabel,
        formatPercent(result.volatility),
        formatPercent(userPortfolio.volatility),
      ],
    ]
  );

  ensureSpace(ctx, 8);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  setText(doc, ctx.colors.muted);
  const noteLines = doc.splitTextToSize(labels.compareDisclaimer, CONTENT_WIDTH);
  noteLines.forEach((line: string) => {
    doc.text(line, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(7.5);
  });
  ctx.y += 5;
}

function drawCharts(ctx: DrawContext, input: SimulationPdfInput): void {
  const { doc } = ctx;

  input.charts.forEach((chart) => {
    const imageHeight = (CONTENT_WIDTH * chart.height) / chart.width;
    const legendHeight = chart.legend?.length ? 6 : 0;
    const captionHeight = chart.subtitle ? 11 : 7;
    const blockHeight = imageHeight + legendHeight + captionHeight + 8;

    // Charts are never split across pages: move the whole block down instead.
    if (ctx.y + blockHeight > PAGE_BOTTOM) newPage(ctx);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    setText(doc, ctx.colors.text);
    doc.text(chart.title, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(10.5);

    if (chart.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, ctx.colors.muted);
      doc.text(chart.subtitle, MARGIN, ctx.y, { baseline: "top" });
      ctx.y += lineHeight(7.5);
    }
    ctx.y += 2;

    if (chart.legend?.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      let x = MARGIN;
      chart.legend.forEach((item) => {
        const labelWidth = doc.getTextWidth(item.label);
        if (x + labelWidth + 10 > MARGIN + CONTENT_WIDTH) return;
        setFill(doc, item.color);
        doc.circle(x + 1.2, ctx.y + 1.4, 1.2, "F");
        setText(doc, ctx.colors.muted);
        doc.text(item.label, x + 4, ctx.y, { baseline: "top" });
        x += labelWidth + 10;
      });
      ctx.y += legendHeight;
    }

    doc.addImage(
      chart.dataUrl,
      "PNG",
      MARGIN,
      ctx.y,
      CONTENT_WIDTH,
      imageHeight
    );
    ctx.y += imageHeight + 8;
  });
}

/**
 * One line: the disclaimer on the left, then — for a co-branded tenant only —
 * "Powered by us", then the page number hard right. The line is laid out from
 * the right so the disclaimer gets whatever is left rather than colliding with
 * the credit, which is the only piece whose width nobody controls.
 */
function drawFooters(
  doc: jsPDF,
  labels: SimulationPdfLabels,
  colors: TenantPdfColors,
  showPoweredBy: boolean
): void {
  const total = doc.getNumberOfPages();
  const gap = 6;

  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    const y = PAGE_HEIGHT - MARGIN - 4;

    setStroke(doc, colors.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y - 3, MARGIN + CONTENT_WIDTH, y - 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(doc, colors.muted);

    let right = MARGIN + CONTENT_WIDTH;
    const pageLabel = labels.formatPage(page, total);
    doc.text(pageLabel, right, y, { baseline: "top", align: "right" });
    right -= doc.getTextWidth(pageLabel) + gap;

    if (showPoweredBy && labels.poweredBy) {
      doc.text(labels.poweredBy, right, y, { baseline: "top", align: "right" });
      right -= doc.getTextWidth(labels.poweredBy) + gap;
    }

    doc.text(truncateToWidth(doc, labels.disclaimer, right - MARGIN), MARGIN, y, {
      baseline: "top",
    });
  }
}

function formatDateRange(params: SimulationParams): string {
  const { dateRange } = params;
  const start = `01/${String(dateRange.startMonth).padStart(2, "0")}/${dateRange.startYear}`;
  const lastDay = new Date(dateRange.endYear, dateRange.endMonth, 0).getDate();
  const end = `${String(lastDay).padStart(2, "0")}/${String(dateRange.endMonth).padStart(2, "0")}/${dateRange.endYear}`;
  return `${start} - ${end}`;
}

/**
 * The report palette with no tenant accent applied.
 *
 * Callers that need a colour *before* a report exists read it here — the chart
 * rasterizer in `useSimulationPdfExport` paints its PNGs on `surface`. Every
 * value it exposes is one of the fixed chrome colours, so no tenant is missing
 * anything by reading this rather than their own derived palette.
 */
export const PDF_COLORS: TenantPdfColors = deriveTenantPalette(null).pdf;
