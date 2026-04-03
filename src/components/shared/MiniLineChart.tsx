import React from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface MiniLineChartProps {
  data: { value: number }[];
  color?: string;
  height?: number;
  width?: number;
}

export function MiniLineChart({
  data,
  color = "#6366f1",
  height = 40,
  width = 120,
}: MiniLineChartProps) {
  if (data.length < 2) return null;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
