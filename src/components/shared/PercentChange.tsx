import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatPercent } from "@/lib/formatters";

interface PercentChangeProps {
  value: number;
  label?: string;
  invert?: boolean;
  size?: "small" | "default";
}

export function PercentChange({
  value,
  label,
  invert = false,
  size = "default",
}: PercentChangeProps) {
  const isPositive = value >= 0;
  const isFavorable = invert ? !isPositive : isPositive;
  const color = isFavorable ? "#52c41a" : "#ff4d4f";
  const bgColor = isFavorable ? "rgba(82, 196, 26, 0.08)" : "rgba(255, 77, 79, 0.08)";
  const iconSize = size === "small" ? 10 : 12;
  const fontSize = size === "small" ? 11 : 12;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        borderRadius: 4,
        background: bgColor,
        color,
        fontSize,
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      <Icon size={iconSize} />
      {isPositive ? "+" : ""}
      {formatPercent(value)}
      {label && (
        <span style={{ color: "#8c8c8c", fontWeight: 400, marginLeft: 2 }}>
          {label}
        </span>
      )}
    </span>
  );
}
