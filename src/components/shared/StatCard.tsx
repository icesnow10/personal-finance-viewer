import React from "react";
import { Card, Statistic, Space, Typography } from "antd";
import { PercentChange } from "./PercentChange";
import { useRedact } from "@/context/RedactContext";

const { Text } = Typography;

interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  precision?: number;
  valueColor?: string;
  trend?: { value: number; label?: string };
  chart?: React.ReactNode;
  style?: React.CSSProperties;
}

export function StatCard({
  title,
  value,
  prefix = "R$",
  precision = 2,
  valueColor,
  trend,
  chart,
  style,
}: StatCardProps) {
  const { redacted } = useRedact();
  return (
    <Card size="small" style={style}>
      <Text
        type="secondary"
        style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {title}
      </Text>
      <div style={{ marginTop: 4 }}>
        {redacted && prefix === "R$" ? (
          <div style={{ fontSize: 24, fontWeight: 700, color: valueColor, lineHeight: 1.2 }}>
            R$ •••••
          </div>
        ) : (
          <Statistic
            value={value}
            prefix={prefix}
            precision={precision}
            valueStyle={{
              fontSize: 24,
              fontWeight: 700,
              color: valueColor,
              lineHeight: 1.2,
            }}
          />
        )}
      </div>
      {(trend || chart) && (
        <Space style={{ marginTop: 8 }} size={12}>
          {trend && <PercentChange value={trend.value} label={trend.label} />}
          {chart}
        </Space>
      )}
    </Card>
  );
}
