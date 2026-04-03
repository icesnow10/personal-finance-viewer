import React, { useMemo, useState } from "react";
import { Card, Row, Col, Typography, Table, Tag, Space, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { useBudget } from "@/hooks/useBudget";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { StatCard } from "@/components/shared/StatCard";
import { PercentChange } from "@/components/shared/PercentChange";
import { MiniLineChart } from "@/components/shared/MiniLineChart";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getIncomeByMonth } from "@/lib/computations";
import { formatBRL, formatMonthShort } from "@/lib/formatters";
import { HOLDER_COLORS } from "@/lib/category-meta";
import type { IncomeItem } from "@/lib/types";

const { Text, Title } = Typography;

export default function IncomePage() {
  const { data: activeData, allMonths } = useBudget();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const monthPills = useMemo(
    () => allMonths.map((m) => ({ month: m.month, net: m.summary.net })),
    [allMonths]
  );

  const data = useMemo(() => {
    if (selectedMonth) return allMonths.find((m) => m.month === selectedMonth) || activeData;
    return activeData;
  }, [selectedMonth, allMonths, activeData]);

  const previousData = useMemo(() => {
    if (!data) return null;
    const sorted = allMonths.filter((m) => m.month < data.month).sort((a, b) => b.month.localeCompare(a.month));
    return sorted[0] || null;
  }, [data, allMonths]);

  const incomeByMonth = useMemo(() => getIncomeByMonth(allMonths), [allMonths]);

  const barChartData = useMemo(
    () => incomeByMonth.map((m) => ({
      month: formatMonthShort(m.month),
      rawMonth: m.month,
      total: m.total,
    })),
    [incomeByMonth]
  );

  const incomeTrend = useMemo(
    () => incomeByMonth.map((m) => ({ value: m.total })),
    [incomeByMonth]
  );

  const variation = useMemo(() => {
    if (!data || !previousData) return null;
    if (previousData.income.total === 0) return null;
    return ((data.income.total - previousData.income.total) / previousData.income.total) * 100;
  }, [data, previousData]);

  const byHolder = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const item of data.income.items) {
      map.set(item.holder, (map.get(item.holder) || 0) + item.amount);
    }
    return Array.from(map.entries())
      .map(([holder, amount]) => ({ holder, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const columns: ColumnsType<IncomeItem> = [
    {
      title: "Data",
      dataIndex: "date",
      key: "date",
      width: 100,
      render: (d: string | null) => {
        if (!d) return <Text type="secondary">--</Text>;
        const parts = d.split("-");
        return <Text style={{ fontSize: 13 }}>{parts[2]}/{parts[1]}</Text>;
      },
    },
    {
      title: "Descricao",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (desc: string) => <Text style={{ fontSize: 13 }}>{desc}</Text>,
    },
    {
      title: "Fonte",
      dataIndex: "source",
      key: "source",
      width: 160,
      render: (s: string) => <Text type="secondary" style={{ fontSize: 12 }}>{s}</Text>,
    },
    {
      title: "Titular",
      dataIndex: "holder",
      key: "holder",
      width: 90,
      render: (h: string) => <Tag color={HOLDER_COLORS[h] || "default"}>{h}</Tag>,
    },
    {
      title: "Valor",
      dataIndex: "amount",
      key: "amount",
      width: 130,
      align: "right",
      sorter: (a, b) => a.amount - b.amount,
      defaultSortOrder: "descend",
      render: (v: number) => (
        <Text strong style={{ fontSize: 14, color: "#52c41a" }}>
          +{formatBRL(v)}
        </Text>
      ),
    },
  ];

  if (!data) return <EmptyState />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Receitas</Title>
        <MonthSelector months={monthPills} selected={data.month} onSelect={setSelectedMonth} />
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <StatCard
            title="Receita Total"
            value={data.income.total}
            valueColor="#52c41a"
            trend={variation != null ? { value: variation, label: "vs ant." } : undefined}
            chart={incomeTrend.length > 1 ? <MiniLineChart data={incomeTrend} color="#52c41a" /> : undefined}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="Itens de Receita"
            value={data.income.items.length}
            prefix=""
            precision={0}
          />
        </Col>
        {byHolder.map((h) => (
          <Col span={6} key={h.holder}>
            <StatCard
              title={h.holder}
              value={h.amount}
              valueColor="#52c41a"
            />
          </Col>
        ))}
      </Row>

      {allMonths.length > 1 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <SectionHeader title="Evolucao da Receita" />
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barChartData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => [formatBRL(v), "Receita"]}
                contentStyle={{ borderRadius: 8 }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {barChartData.map((entry) => (
                  <Cell
                    key={entry.rawMonth}
                    fill={entry.rawMonth === data.month ? "#52c41a" : "rgba(82, 196, 26, 0.3)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card size="small">
        <SectionHeader title="Detalhamento" />
        <Table
          dataSource={data.income.items}
          columns={columns}
          rowKey={(_, i) => `income-${i}`}
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  );
}
