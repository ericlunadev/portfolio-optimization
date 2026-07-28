"use client";

import { ReactNode } from "react";

/**
 * Off-screen mount point for the charts that go into the PDF export.
 *
 * The on-screen charts cannot be captured directly: they live behind tabs and
 * behind `ChartReveal`, so whichever ones the user has not scrolled to (or has
 * not opened the tab for) simply are not in the DOM. Rendering a dedicated copy
 * at a fixed width makes the export deterministic and independent of viewport
 * size, scroll position, and the active tab.
 */

/** Marks a wrapper so the exporter can find its `<svg>` afterwards. */
export const PDF_CHART_KEY_ATTRIBUTE = "data-pdf-chart";

/** Fixed capture width in CSS pixels. Wide enough for readable axis labels. */
export const PDF_CHART_WIDTH = 880;

export interface PdfChartSpec {
  /** Unique key, also used as the DOM lookup handle. */
  key: string;
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
  /**
   * Time-series and scatter charts size themselves off the *viewport* via
   * Tailwind breakpoints. Flag them so the export pins a stable plot height.
   */
  tall?: boolean;
  node: ReactNode;
}

interface SimulationPdfChartsProps {
  charts: PdfChartSpec[];
}

export function SimulationPdfCharts({ charts }: SimulationPdfChartsProps) {
  return (
    <div
      aria-hidden
      data-pdf-charts-root=""
      style={{
        position: "fixed",
        top: 0,
        left: -100000,
        width: PDF_CHART_WIDTH,
        pointerEvents: "none",
        opacity: 0,
        zIndex: -1,
      }}
    >
      {charts.map((chart) => (
        <div
          key={chart.key}
          {...{ [PDF_CHART_KEY_ATTRIBUTE]: chart.key }}
          className={chart.tall ? "pdf-chart-tall" : undefined}
          style={{ width: PDF_CHART_WIDTH }}
        >
          {chart.node}
        </div>
      ))}
    </div>
  );
}
