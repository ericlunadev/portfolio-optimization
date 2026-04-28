"use client";

import { cn } from "@/lib/utils";

interface MatrixTableProps {
  title: string;
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
  const getColorClass = (value: number, isCorrelationCell: boolean) => {
    if (!colorScale) return "";

    if (isCorrelationCell) {
      // For correlation: -1 to 1
      if (value >= 0.7) return "bg-green-100 dark:bg-green-900/30";
      if (value >= 0.3) return "bg-green-50 dark:bg-green-900/10";
      if (value <= -0.3) return "bg-red-50 dark:bg-red-900/10";
      if (value <= -0.7) return "bg-red-100 dark:bg-red-900/30";
      return "";
    } else {
      // For covariance: highlight diagonal (variance)
      return "";
    }
  };

  return (
    <div>
      <h4 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h4>
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
                      i === j && "font-semibold",
                      getColorClass(value, isCorrelation)
                    )}
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
