import React, { useMemo, useState } from "react";
import { Card, Typography, Space, theme, Segmented, Empty } from "antd";
import {
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useBudget } from "@/hooks/useBudget";
import { getBudgetSummary } from "@/lib/computations";

const { Title, Text } = Typography;

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatCompact(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Housing: "#4096ff",
  Health: "#f5222d",
  Insurance: "#722ed1",
  Groceries: "#52c41a",
  Transportation: "#fa8c16",
  Wellness: "#13c2c2",
  Subscriptions: "#9254de",
  Services: "#eb2f96",
  "Food/Dining": "#faad14",
  Shopping: "#2f54eb",
  Travel: "#1890ff",
  "Family Support": "#ff7a45",
  Recreation: "#87d068",
  "Personal Care": "#f759ab",
};

function getCategoryColor(name: string, idx: number): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  const fallback = [
    "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#84cc16", "#e11d48", "#7c3aed", "#0ea5e9",
  ];
  return fallback[idx % fallback.length];
}

export default function ReportsPage() {
  const { allMonths } = useBudget();
  const { token } = theme.useToken();
  const [sparklineView, setSparklineView] = useState<"expenses" | "income">("expenses");
  const [sparklinePage, setSparklinePage] = useState(0);

  // Build income vs expenses trend from all months
  const trendData = useMemo(() => {
    if (!allMonths || allMonths.length === 0) return [];
    return [...allMonths]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => {
        const summary = getBudgetSummary(m);
        return {
          month: m.month,
          label: monthLabel(m.month),
          income: summary.total_income,
          expenses: Math.abs(summary.total_expenses),
          net: summary.net,
        };
      });
  }, [allMonths]);

  // Build category trends — each category's total per month
  const categoryTrends = useMemo(() => {
    if (!allMonths || allMonths.length === 0) return { expenses: [], income: [] };

    const sorted = [...allMonths].sort((a, b) => a.month.localeCompare(b.month));

    // Expense categories
    const catMap: Record<string, { month: string; total: number }[]> = {};
    for (const m of sorted) {
      const cats = m.expenses?.by_category ?? {};
      for (const [catName, catData] of Object.entries(cats)) {
        if (!catMap[catName]) catMap[catName] = [];
        catMap[catName].push({ month: m.month, total: (catData as any)?.total ?? 0 });
      }
    }

    const expenseCategories = Object.entries(catMap)
      .map(([name, series]) => ({
        name,
        total: series.reduce((s, d) => s + Math.abs(d.total), 0),
        series: sorted.map((m) => {
          const found = series.find((s) => s.month === m.month);
          return { month: m.month, label: monthLabel(m.month), value: Math.abs(found?.total ?? 0) };
        }),
      }))
      .sort((a, b) => b.total - a.total);

    // Income breakdown by holder
    const holderMap: Record<string, { month: string; total: number }[]> = {};
    for (const m of sorted) {
      const items = m.income?.items ?? [];
      for (const item of items) {
        const key = item.holder || "other";
        if (!holderMap[key]) holderMap[key] = [];
        const existing = holderMap[key].find((e) => e.month === m.month);
        if (existing) {
          existing.total += item.amount;
        } else {
          holderMap[key].push({ month: m.month, total: item.amount });
        }
      }
    }

    const incomeCategories = Object.entries(holderMap)
      .map(([name, series]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        total: series.reduce((s, d) => s + d.total, 0),
        series: sorted.map((m) => {
          const found = series.find((s) => s.month === m.month);
          return { month: m.month, label: monthLabel(m.month), value: found?.total ?? 0 };
        }),
      }))
      .sort((a, b) => b.total - a.total);

    return { expenses: expenseCategories, income: incomeCategories };
  }, [allMonths]);

  const sparklineItems = sparklineView === "expenses" ? categoryTrends.expenses : categoryTrends.income;
  const ITEMS_PER_PAGE = 6;
  const totalPages = Math.ceil(sparklineItems.length / ITEMS_PER_PAGE);
  const currentPageItems = sparklineItems.slice(
    sparklinePage * ITEMS_PER_PAGE,
    (sparklinePage + 1) * ITEMS_PER_PAGE
  );

  // Summary stats
  const latestMonth = trendData.length > 0 ? trendData[trendData.length - 1] : null;
  const avgIncome = trendData.length > 0 ? trendData.reduce((s, d) => s + d.income, 0) / trendData.length : 0;
  const avgExpenses = trendData.length > 0 ? trendData.reduce((s, d) => s + d.expenses, 0) / trendData.length : 0;

  const tooltipStyle: React.CSSProperties = {
    background: token.colorBgContainer,
    color: token.colorText,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    fontSize: 12,
  };

  if (!allMonths || allMonths.length === 0) {
    return <Empty description="Nenhum dado disponivel" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Title level={3} style={{ margin: 0 }}>
        Relatorios
      </Title>

      {/* Hero Summary */}
      <Card size="small" style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
              Receita vs Despesas
            </Text>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <Title level={2} style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
                {formatBRL(latestMonth?.net ?? 0)}
              </Title>
              <Text style={{ fontSize: 13, color: (latestMonth?.net ?? 0) >= 0 ? "#52c41a" : "#f5222d" }}>
                saldo {latestMonth?.label}
              </Text>
            </div>
          </div>
          <Space size={32}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#52c41a" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Receita (media)</Text>
              </div>
              <Text strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                {formatBRL(avgIncome)}
              </Text>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f5222d" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Despesas (media)</Text>
              </div>
              <Text strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                {formatBRL(avgExpenses)}
              </Text>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#6366f1" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Saldo (media)</Text>
              </div>
              <Text strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                {formatBRL(avgIncome - avgExpenses)}
              </Text>
            </div>
          </Space>
        </div>
      </Card>

      {/* Income vs Expenses Trend Chart */}
      <Card
        size="small"
        style={{ borderRadius: 12 }}
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Text strong style={{ fontSize: 14 }}>Receita vs Despesas</Text>
            <Space size={12}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#52c41a" }} />
                <Text type="secondary" style={{ fontSize: 11 }}>Receita</Text>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5222d" }} />
                <Text type="secondary" style={{ fontSize: 11 }}>Despesas</Text>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 0, borderTop: "2px dashed #6366f1" }} />
                <Text type="secondary" style={{ fontSize: 11 }}>Saldo</Text>
              </div>
            </Space>
          </div>
        }
      >
        <div style={{ height: 320 }}>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: token.colorTextSecondary }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => (v === 0 ? "0" : formatCompact(v))}
                  tick={{ fontSize: 10, fill: token.colorTextSecondary }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickCount={5}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatBRL(value),
                    name === "income" ? "Receita" : name === "expenses" ? "Despesas" : "Saldo",
                  ]}
                  labelFormatter={(label) => label}
                  contentStyle={tooltipStyle}
                />
                <ReferenceLine y={0} stroke={token.colorBorderSecondary} strokeDasharray="3 3" />
                <Bar dataKey="income" fill="#52c41a" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="expenses" fill="#f5222d" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366f1" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="Sem dados" />
          )}
        </div>
      </Card>

      {/* Category Trends — Sparklines */}
      <Card
        size="small"
        style={{ borderRadius: 12 }}
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Text strong style={{ fontSize: 14 }}>Tendencias por Categoria</Text>
            <Space size={8}>
              {totalPages > 1 && (
                <Space size={2}>
                  <button
                    onClick={() => setSparklinePage((p) => Math.max(0, p - 1))}
                    disabled={sparklinePage === 0}
                    style={{
                      background: "none", border: "none", cursor: sparklinePage === 0 ? "not-allowed" : "pointer",
                      opacity: sparklinePage === 0 ? 0.3 : 1, padding: 4, color: token.colorText,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <Text type="secondary" style={{ fontSize: 11 }}>{sparklinePage + 1}/{totalPages}</Text>
                  <button
                    onClick={() => setSparklinePage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={sparklinePage >= totalPages - 1}
                    style={{
                      background: "none", border: "none", cursor: sparklinePage >= totalPages - 1 ? "not-allowed" : "pointer",
                      opacity: sparklinePage >= totalPages - 1 ? 0.3 : 1, padding: 4, color: token.colorText,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </Space>
              )}
              <Segmented
                size="small"
                value={sparklineView}
                onChange={(v) => { setSparklineView(v as any); setSparklinePage(0); }}
                options={[
                  { label: "Despesas", value: "expenses" },
                  { label: "Receita", value: "income" },
                ]}
              />
            </Space>
          </div>
        }
      >
        {currentPageItems.length === 0 ? (
          <Empty description="Sem dados" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {currentPageItems.map((item, idx) => {
              const color = getCategoryColor(item.name, sparklinePage * ITEMS_PER_PAGE + idx);
              const gradId = `grad-${item.name.replace(/[^a-z0-9]/gi, "")}`;
              return (
                <div
                  key={item.name}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgLayout,
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <Text
                      type="secondary"
                      style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {item.name}
                    </Text>
                  </div>
                  <Text strong style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {formatCompact(item.total)}
                  </Text>
                  <div style={{ height: 48, marginTop: 4 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={item.series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" hide />
                        <Tooltip
                          formatter={(value: number) => [formatBRL(value), item.name]}
                          labelFormatter={(label) => label}
                          contentStyle={{ ...tooltipStyle, padding: "4px 8px" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={color}
                          strokeWidth={1.5}
                          fill={`url(#${gradId})`}
                          dot={false}
                          activeDot={{ r: 2, fill: color }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
