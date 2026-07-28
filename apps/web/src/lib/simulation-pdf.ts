import type { jsPDF } from "jspdf";
import type { OptimizationResultWithStrategy, SimulationParams } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/utils";

/**
 * Builds the "export simulation to PDF" report.
 *
 * Charts arrive pre-rasterized (see `svg-to-png`); everything else is drawn as
 * real vector text so the numbers stay selectable and searchable in the PDF.
 * The palette mirrors the dark app theme because the charts are painted for a
 * dark background and would be unreadable on white.
 */

// A4 portrait, millimetres.
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 12;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

const COLOR_BACKGROUND = "#0b0c0f";
const COLOR_SURFACE = "#14161c";
const COLOR_BORDER = "#2a2d38";
const COLOR_TEXT = "#e7e6e4";
const COLOR_MUTED = "#8b8fa0";
const COLOR_GOLD = "#d6a042";
const COLOR_GOLD_SOFT = "#fcd9a8";
const COLOR_USER = "#fbbf24";

/** Points to millimetres. */
const PT_TO_MM = 0.3528;

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
}

export async function buildSimulationPdf(
  input: SimulationPdfInput
): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "mm", format: "a4", compress: true });

  const ctx: DrawContext = { doc, y: MARGIN };
  paintPageBackground(doc);

  drawHeader(ctx, input);
  drawMetrics(ctx, input);
  drawParameters(ctx, input);
  drawAllocationTable(ctx, input);
  drawRiskTable(ctx, input);
  if (input.userPortfolio) drawComparison(ctx, input);
  drawCharts(ctx, input);
  drawFooters(doc, input.labels);

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

function paintPageBackground(doc: jsPDF): void {
  setFill(doc, COLOR_BACKGROUND);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
}

function newPage(ctx: DrawContext): void {
  ctx.doc.addPage();
  paintPageBackground(ctx.doc);
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
  setText(doc, COLOR_GOLD);
  doc.text(text.toUpperCase(), MARGIN, ctx.y, { baseline: "top" });
  ctx.y += lineHeight(10) + 1.5;

  setStroke(doc, COLOR_BORDER);
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
    setFill(doc, COLOR_SURFACE);
    doc.rect(MARGIN, ctx.y, CONTENT_WIDTH, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, COLOR_MUTED);
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
      setText(doc, isHighlighted ? COLOR_GOLD_SOFT : COLOR_TEXT);
      doc.setFont("helvetica", isHighlighted ? "bold" : "normal");
      const cell = truncateToWidth(doc, row[index] ?? "", column.width - 6);
      doc.text(cell, isRight ? x + column.width - 6 : x, ctx.y + 2.1, {
        baseline: "top",
        align: isRight ? "right" : "left",
      });
      x += column.width;
    });

    ctx.y += rowHeight;
    setStroke(doc, COLOR_BORDER);
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

  setFill(doc, COLOR_GOLD);
  doc.rect(MARGIN, ctx.y, 22, 1, "F");
  ctx.y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, COLOR_MUTED);
  doc.text(labels.documentTitle.toUpperCase(), MARGIN, ctx.y, {
    baseline: "top",
  });
  ctx.y += lineHeight(8.5) + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setText(doc, COLOR_TEXT);
  const titleLines = doc.splitTextToSize(input.title, CONTENT_WIDTH);
  titleLines.forEach((line: string) => {
    doc.text(line, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(19);
  });
  ctx.y += 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, COLOR_MUTED);
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

function drawMetrics(ctx: DrawContext, input: SimulationPdfInput): void {
  const { doc } = ctx;
  const { labels, result } = input;

  const cards = [
    {
      label: labels.expectedReturn,
      value: formatPercent(result.expected_return),
      hint: `${labels.ci95Label}: ${formatPercent(result.stats.ci_95_low)} / ${formatPercent(result.stats.ci_95_high)}`,
    },
    {
      label: labels.volatility,
      value: formatPercent(result.volatility),
      hint: "",
    },
    {
      label: labels.sharpeRatio,
      value:
        result.sharpe_ratio != null
          ? formatNumber(result.sharpe_ratio, 2)
          : labels.notAvailable,
      hint: "",
    },
    {
      label: labels.probNeg1y,
      value: formatPercent(result.stats.prob_neg_1y),
      hint: "",
    },
  ];

  const gap = 3;
  const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
  const cardHeight = 24;

  ensureSpace(ctx, cardHeight + 4);

  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    setFill(doc, COLOR_SURFACE);
    setStroke(doc, COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, ctx.y, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, COLOR_MUTED);
    doc.text(truncateToWidth(doc, card.label, cardWidth - 6), x + 3, ctx.y + 4, {
      baseline: "top",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(doc, COLOR_GOLD_SOFT);
    doc.text(card.value, x + 3, ctx.y + 10, { baseline: "top" });

    if (card.hint) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      setText(doc, COLOR_MUTED);
      doc.text(truncateToWidth(doc, card.hint, cardWidth - 6), x + 3, ctx.y + 18, {
        baseline: "top",
      });
    }
  });

  ctx.y += cardHeight + 8;
}

function drawParameters(ctx: DrawContext, input: SimulationPdfInput): void {
  const { doc } = ctx;
  const { labels, params } = input;

  drawSectionHeading(ctx, labels.parametersHeading);

  const entries: [string, string][] = [
    [labels.dateRange, formatDateRange(params)],
    [labels.strategy, input.strategyLabel],
  ];

  if (params.strategy === "max-sharpe") {
    entries.push([labels.riskFreeRate, formatPercent(params.riskFreeRate, 3)]);
  }
  if (params.strategy === "target-return" && params.targetReturn !== undefined) {
    entries.push([labels.targetReturn, formatPercent(params.targetReturn, 1)]);
  }
  if (params.strategy === "target-risk" && params.targetRisk !== undefined) {
    entries.push([labels.targetRisk, formatPercent(params.targetRisk, 1)]);
  }
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
    entries.push([labels.maxWeightPerAsset, `${Math.round(params.wMax * 100)}%`]);
  }

  const columnWidth = CONTENT_WIDTH / 2;
  const rowHeight = 9;

  for (let i = 0; i < entries.length; i += 2) {
    ensureSpace(ctx, rowHeight);
    const pair = entries.slice(i, i + 2);
    pair.forEach(([label, value], column) => {
      const x = MARGIN + column * columnWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, COLOR_MUTED);
      doc.text(label, x, ctx.y, { baseline: "top" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setText(doc, COLOR_TEXT);
      doc.text(truncateToWidth(doc, value, columnWidth - 4), x, ctx.y + 3.4, {
        baseline: "top",
      });
    });
    ctx.y += rowHeight;
  }

  ctx.y += 2;
  ensureSpace(ctx, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setText(doc, COLOR_MUTED);
  doc.text(labels.assets, MARGIN, ctx.y, { baseline: "top" });
  ctx.y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, COLOR_TEXT);
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

function drawAllocationTable(ctx: DrawContext, input: SimulationPdfInput): void {
  const { labels, result } = input;
  drawSectionHeading(ctx, labels.allocationHeading);

  drawTable(
    ctx,
    [
      { header: labels.tableAsset, width: CONTENT_WIDTH * 0.4 },
      {
        header: labels.tableExpReturn,
        width: CONTENT_WIDTH * 0.2,
        align: "right",
      },
      {
        header: labels.tableVolatility,
        width: CONTENT_WIDTH * 0.2,
        align: "right",
      },
      { header: labels.tableWeight, width: CONTENT_WIDTH * 0.2, align: "right" },
    ],
    result.weights.map((weight) => [
      weight.fund_name,
      formatPercent(weight.exp_ret),
      formatPercent(weight.volatility),
      formatPercent(weight.weight),
    ]),
    { highlightLastColumn: true }
  );
}

function drawRiskTable(ctx: DrawContext, input: SimulationPdfInput): void {
  const { labels, result } = input;
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
    [
      [labels.horizon1m, formatPercent(result.stats.prob_neg_1m)],
      [labels.horizon3m, formatPercent(result.stats.prob_neg_3m)],
      [labels.horizon1y, formatPercent(result.stats.prob_neg_1y)],
      [labels.horizon2y, formatPercent(result.stats.prob_neg_2y)],
    ]
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
  setText(doc, COLOR_MUTED);
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
    setText(doc, COLOR_TEXT);
    doc.text(chart.title, MARGIN, ctx.y, { baseline: "top" });
    ctx.y += lineHeight(10.5);

    if (chart.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, COLOR_MUTED);
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
        setText(doc, COLOR_MUTED);
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

function drawFooters(doc: jsPDF, labels: SimulationPdfLabels): void {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    const y = PAGE_HEIGHT - MARGIN - 4;

    setStroke(doc, COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y - 3, MARGIN + CONTENT_WIDTH, y - 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(doc, COLOR_MUTED);
    doc.text(truncateToWidth(doc, labels.disclaimer, CONTENT_WIDTH - 24), MARGIN, y, {
      baseline: "top",
    });
    doc.text(labels.formatPage(page, total), MARGIN + CONTENT_WIDTH, y, {
      baseline: "top",
      align: "right",
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

export const PDF_COLORS = {
  background: COLOR_BACKGROUND,
  surface: COLOR_SURFACE,
  gold: COLOR_GOLD,
  user: COLOR_USER,
};
