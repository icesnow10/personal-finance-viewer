import React from "react";
import { Space, Typography, theme } from "antd";
import { formatBRL } from "@/lib/formatters";
import { getCategoryMeta } from "@/lib/category-meta";
import { PercentChange } from "./PercentChange";

const { Text } = Typography;

interface CategoryBarProps {
  category: string;
  amount: number;
  maxAmount: number;
  previousAmount?: number | null;
  variation?: number | null;
  rank?: number;
  onClick?: () => void;
}

export function CategoryBar({
  category,
  amount,
  maxAmount,
  previousAmount,
  variation,
  rank,
  onClick,
}: CategoryBarProps) {
  const { token } = theme.useToken();
  const { emoji, color } = getCategoryMeta(category);
  const barWidth = maxAmount > 0 ? Math.max((amount / maxAmount) * 100, 2) : 0;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />

      {/* Rank badge */}
      {rank != null && (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: color,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {rank}
        </div>
      )}

      {/* Emoji + Name */}
      <Space size={6} style={{ minWidth: 160, flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <Text style={{ fontSize: 13 }}>{category}</Text>
      </Space>

      {/* Amount */}
      <Text strong style={{ fontSize: 13, minWidth: 90, textAlign: "right", flexShrink: 0 }}>
        {formatBRL(amount)}
      </Text>

      {/* Bar */}
      <div style={{ flex: 1, minWidth: 80 }}>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: token.colorFillSecondary,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${barWidth}%`,
              background: color,
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Variation */}
      <div style={{ minWidth: 80, textAlign: "right", flexShrink: 0 }}>
        {variation != null ? (
          <PercentChange value={variation} invert size="small" />
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>--</Text>
        )}
      </div>

      {/* Previous amount */}
      <div style={{ minWidth: 70, textAlign: "right", flexShrink: 0 }}>
        {previousAmount != null ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatBRL(previousAmount)}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>--</Text>
        )}
      </div>
    </div>
  );
}
