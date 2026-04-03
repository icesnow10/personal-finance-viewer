import React from "react";
import { Space, Button, Typography, theme } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthShortYear, formatCompact, REDACTED } from "@/lib/formatters";
import { useRedact } from "@/context/RedactContext";

const { Text } = Typography;

interface MonthPill {
  month: string;
  net?: number;
}

interface MonthSelectorProps {
  months: MonthPill[];
  selected: string;
  onSelect: (month: string) => void;
}

export function MonthSelector({ months, selected, onSelect }: MonthSelectorProps) {
  const { token } = theme.useToken();
  const { redacted } = useRedact();

  if (months.length <= 1) {
    const m = months[0];
    if (!m) return null;
    return (
      <Text strong style={{ fontSize: 16 }}>
        {formatMonthShortYear(m.month)}
      </Text>
    );
  }

  const currentIdx = months.findIndex((m) => m.month === selected);

  return (
    <Space size={4} wrap>
      <Button
        type="text"
        size="small"
        icon={<ChevronLeft size={14} />}
        disabled={currentIdx <= 0}
        onClick={() => currentIdx > 0 && onSelect(months[currentIdx - 1].month)}
      />
      {months.map((m) => {
        const isSelected = m.month === selected;
        const netColor =
          m.net != null ? (m.net >= 0 ? "#52c41a" : "#ff4d4f") : undefined;

        return (
          <Button
            key={m.month}
            size="small"
            type={isSelected ? "primary" : "text"}
            onClick={() => onSelect(m.month)}
            style={{
              borderRadius: token.borderRadius,
              fontWeight: isSelected ? 600 : 400,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              height: "auto",
              padding: "4px 12px",
              lineHeight: 1.3,
            }}
          >
            <span style={{ fontSize: 12 }}>{formatMonthShortYear(m.month)}</span>
            {m.net != null && (
              <span
                style={{
                  fontSize: 10,
                  color: isSelected ? "inherit" : netColor,
                  fontWeight: 500,
                }}
              >
                {redacted ? "•••" : formatCompact(m.net)}
              </span>
            )}
          </Button>
        );
      })}
      <Button
        type="text"
        size="small"
        icon={<ChevronRight size={14} />}
        disabled={currentIdx >= months.length - 1}
        onClick={() =>
          currentIdx < months.length - 1 && onSelect(months[currentIdx + 1].month)
        }
      />
    </Space>
  );
}
