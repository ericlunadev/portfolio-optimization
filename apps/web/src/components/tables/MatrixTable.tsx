"use client";

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Correlation heat, read as diversification: red means the pair moves together
 * (little diversification), blue means it moves apart (real diversification) —
 * the same reading the academia station teaches. The scale is alpha-composited
 * over the page, so it lands light on a light theme and dark on a dark one
 * while the number keeps its own token colour.
 */
function correlationBackground(value: number): string {
  const strength = Math.min(Math.abs(value), 1);
  const alpha = strength * 0.55 + 0.04;
  const hue = value >= 0 ? "0 65% 55%" : "200 55% 55%";
  return `hsl(${hue} / ${alpha})`;
}

interface MatrixTableProps {
  title?: string;
  labels: string[];
  matrix: number[][];
  formatValue?: (value: number) => string;
  colorScale?: boolean;
  isCorrelation?: boolean;
}

export function MatrixTable({
  title,
  labels,
  matrix,
  formatValue = (v) => v.toFixed(4),
  colorScale = false,
  isCorrelation = false,
}: MatrixTableProps) {
  const getCellStyle = (
    value: number,
    isDiagonal: boolean
  ): CSSProperties | undefined => {
    // Covariances are not bounded, so only correlations get a heat scale.
    if (!colorScale || !isCorrelation) return undefined;
    // The diagonal is always 1 and says nothing about diversification, so it
    // takes the neutral accent instead of the hottest red on the scale.
    if (isDiagonal) return { background: "hsl(var(--primary) / 0.12)" };
    return { background: correlationBackground(value) };
  };

  return (
    <div>
      {title && (
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h4>
      )}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-medium"></th>
              {labels.map((label) => (
                <th key={label} className="px-2 py-2 text-center font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]} className="border-b border-border/50">
                <td className="px-2 py-2 font-medium">{labels[i]}</td>
                {row.map((value, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-2 py-2 text-center font-mono",
                      i === j && "font-semibold"
                    )}
                    style={getCellStyle(value, i === j)}
                  >
                    {formatValue(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
