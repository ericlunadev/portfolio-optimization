"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  PDF_CHART_KEY_ATTRIBUTE,
  PdfChartSpec,
  SimulationPdfCharts,
} from "@/components/pdf/SimulationPdfCharts";
import {
  PDF_COLORS,
  PdfChartImage,
  SimulationPdfInput,
  buildSimulationPdf,
  simulationPdfFilename,
} from "@/lib/simulation-pdf";
import { svgToPng } from "@/lib/svg-to-png";

/** How long to wait for a chart's `<svg>` to appear before giving up on it. */
const CHART_MOUNT_TIMEOUT_MS = 6000;
const CHART_POLL_INTERVAL_MS = 100;

/**
 * The off-screen charts render with `animate={false}`, so they paint their final
 * geometry on mount and only need a frame or two to settle. (They must not rely
 * on animation: it is driven by requestAnimationFrame, which browsers suspend in
 * background tabs — a user who switches tabs mid-export would get empty charts.)
 */
const CHART_SETTLE_MS = 150;

export interface UseSimulationPdfExportOptions
  extends Omit<SimulationPdfInput, "charts" | "generatedAt"> {
  charts: PdfChartSpec[];
}

export interface SimulationPdfExport {
  /** Kicks off rendering, capture, and download. Safe to call again after it finishes. */
  exportPdf: () => void;
  isExporting: boolean;
  hasError: boolean;
  /** Must be rendered by the caller — it mounts the off-screen charts. */
  offscreenCharts: ReactNode;
}

export function useSimulationPdfExport(
  options: UseSimulationPdfExportOptions
): SimulationPdfExport {
  const [runId, setRunId] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [hasError, setHasError] = useState(false);

  // The export reads its inputs when it runs, not when the button is wired up,
  // so keep them in a ref and off the effect's dependency list.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const exportPdf = useCallback(() => {
    setHasError(false);
    setIsExporting(true);
    setRunId((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (runId === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const { charts, ...rest } = optionsRef.current;
        const images = await captureCharts(charts);
        if (cancelled) return;

        const generatedAt = new Date();
        const doc = await buildSimulationPdf({
          ...rest,
          generatedAt,
          charts: images,
        });
        if (cancelled) return;

        doc.save(simulationPdfFilename(rest.title, generatedAt));
      } catch (error) {
        console.error("Failed to export simulation PDF", error);
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsExporting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return {
    exportPdf,
    isExporting,
    hasError,
    offscreenCharts: isExporting ? (
      <SimulationPdfCharts charts={options.charts} />
    ) : null,
  };
}

async function captureCharts(specs: PdfChartSpec[]): Promise<PdfChartImage[]> {
  const root = document.querySelector<HTMLElement>("[data-pdf-charts-root]");
  if (!root) throw new Error("The off-screen PDF chart container is not mounted");

  await waitForCharts(root, specs);
  await delay(CHART_SETTLE_MS);

  const images: PdfChartImage[] = [];
  for (const spec of specs) {
    const svg = findChartSvg(root, spec.key);
    if (!svg) continue;

    const { dataUrl, width, height } = await svgToPng(svg, {
      background: PDF_COLORS.surface,
    });
    images.push({
      title: spec.title,
      subtitle: spec.subtitle,
      legend: spec.legend,
      dataUrl,
      width,
      height,
    });
  }

  if (images.length === 0 && specs.length > 0) {
    throw new Error("No charts could be captured for the PDF export");
  }
  return images;
}

/**
 * A chart wrapper also contains small inline `<svg>` legend glyphs, so target
 * the Recharts plotting surface explicitly rather than the first `<svg>`.
 */
export function findChartSvg(
  root: ParentNode,
  key: string
): SVGSVGElement | null {
  const wrapper = root.querySelector(
    `[${PDF_CHART_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`
  );
  if (!wrapper) return null;

  const surface = wrapper.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (surface) return surface;

  // Fall back to the largest `<svg>`, which is still the plot itself.
  const candidates = Array.from(wrapper.querySelectorAll<SVGSVGElement>("svg"));
  return (
    candidates.sort(
      (a, b) =>
        b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height
    )[0] ?? null
  );
}

async function waitForCharts(
  root: HTMLElement,
  specs: PdfChartSpec[]
): Promise<void> {
  const deadline = Date.now() + CHART_MOUNT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const allPainted = specs.every((spec) => {
      const svg = findChartSvg(root, spec.key);
      return !!svg && svg.getBoundingClientRect().width > 0;
    });
    if (allPainted) return;
    await delay(CHART_POLL_INTERVAL_MS);
  }
  // Timed out: export whatever did render rather than failing outright.
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
