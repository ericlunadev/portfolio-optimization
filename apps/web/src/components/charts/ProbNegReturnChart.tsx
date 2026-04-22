"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPercent } from "@/lib/utils";

interface DataPoint {
  months: number;
  probability: number;
}

interface ProbNegReturnChartProps {
  data: DataPoint[];
}

export function ProbNegReturnChart({ data }: ProbNegReturnChartProps) {
  // Auto-scale: calculate max from data with minimum of 1% for visibility
  const maxProb = data?.length ? Math.max(...data.map((d) => d.probability)) : 0;
  const yMax = Math.max(maxProb * 1.2, 0.01);

  // Show message when probabilities are negligible (< 0.01%)
  if (!data?.length || maxProb < 0.0001) {
    return (
      <div className="flex h-[220px] items-center justify-center text-muted-foreground sm:h-[260px] md:h-[300px]">
        <p className="text-center">
          La probabilidad de rendimiento negativo es prácticamente nula
          <br />
          <span className="text-sm">(&lt; 0.01%)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="h-[220px] sm:h-[260px] md:h-[300px]">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="months"
          label={{ value: "Meses", position: "bottom", offset: 0 }}
        />
        <YAxis
          tickFormatter={(v) => formatPercent(v, 0)}
          domain={[0, yMax]}
          label={{
            value: "Probabilidad",
            angle: -90,
            position: "insideLeft",
          }}
        />
        <Tooltip
          formatter={(value: number) => [
            formatPercent(value),
            "Probabilidad de Rendimiento Negativo",
          ]}
          labelFormatter={(label) => `${label} meses`}
        />
        <Area
          type="monotone"
          dataKey="probability"
          stroke="#f87171"
          fill="rgba(248, 113, 113, 0.12)"
          name="Probabilidad"
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
