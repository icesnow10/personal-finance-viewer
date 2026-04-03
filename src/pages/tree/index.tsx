import React, { useMemo, useState } from "react";
import {
  Tree, Card, Empty, Input, Tag, Typography, Space, theme,
  Row, Col, Statistic, Select, Switch,
} from "antd";
import type { DataNode } from "antd/es/tree";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import { useBudget } from "@/hooks/useBudget";

const { Search } = Input;
const { Text } = Typography;

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const REDACTED = "****";
const RedactContext = React.createContext(false);

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, number> }>;
  label?: string;
}

function BucketTooltip({ active, payload, label }: ChartTooltipProps) {
  const redacted = React.useContext(RedactContext);
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, number> | undefined;
  const fmt = (v: number) => redacted ? REDACTED : formatBRL(v);
  return (
    <div style={{
      background: "rgba(0,0,0,0.85)", padding: "8px 12px",
      borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
    }}>
      {label && <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: "#fff", fontSize: 13 }}>
          <span style={{ color: p.color }}>{p.name}: </span>
          {(p.value || 0).toFixed(1)}%
        </div>
      ))}
      {row && (
        <>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", margin: "6px 0" }} />
          <div style={{ color: "#fff", fontSize: 12 }}>Actual: {fmt(row.actualAmt || 0)}</div>
          <div style={{ color: "#fff", fontSize: 12 }}>Desired: {fmt(row.desiredAmt || 0)}</div>
        </>
      )}
    </div>
  );
}

export default function TreePage() {
  const { data: activeData, allMonths } = useBudget();
  const { token } = theme.useToken();
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedHolders, setSelectedHolders] = useState<string[]>([]);
  const [showAmounts, setShowAmounts] = useState(true);
  const [redacted, setRedacted] = useState(false);

  const monthOptions = useMemo(() =>
    allMonths.map((m) => ({ label: m.month + (m.partial ? " (Preview)" : ""), value: m.month })),
    [allMonths]
  );

  const data = useMemo(() => {
    if (selectedMonth) {
      const found = allMonths.find((m) => m.month === selectedMonth);
      if (found) return found;
    }
    return activeData;
  }, [selectedMonth, allMonths, activeData]);

  const holderOptions = useMemo(() => {
    if (!data) return [];
    const holders = new Set<string>();
    data.income.items.forEach((item) => item.holder && holders.add(item.holder));
    Object.values(data.expenses.by_category).forEach((cat) =>
      Object.values(cat.subcategories).forEach((sub) =>
        sub.transactions.forEach((tx) => tx.holder && holders.add(tx.holder))
      )
    );
    (data.expenses.unclassified ?? []).forEach((tx) => tx.holder && holders.add(tx.holder));
    (data.skipped ?? []).forEach((e) => e.holder && holders.add(e.holder));
    return Array.from(holders).sort().map((h) => ({ label: h, value: h }));
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data || selectedHolders.length === 0) return data;
    const hs = new Set(selectedHolders);

    const incomeItems = data.income.items.filter((item) => hs.has(item.holder));
    const incomeTotal = incomeItems.reduce((s, i) => s + i.amount, 0);

    const byCategory: Record<string, typeof data.expenses.by_category[string]> = {};
    let expensesTotal = 0;
    let classifiedTotal = 0;

    for (const [catName, cat] of Object.entries(data.expenses.by_category)) {
      const subs: Record<string, typeof cat.subcategories[string]> = {};
      let catTotal = 0;
      for (const [subName, sub] of Object.entries(cat.subcategories)) {
        const txs = sub.transactions.filter((tx) => hs.has(tx.holder));
        if (txs.length > 0) {
          const subTotal = txs.reduce((s, t) => s + t.amount, 0);
          subs[subName] = { total: subTotal, transactions: txs, entries_count: txs.length };
          catTotal += subTotal;
        }
      }
      if (Object.keys(subs).length > 0) {
        byCategory[catName] = { total: catTotal, subcategories: subs };
        classifiedTotal += catTotal;
      }
    }
    expensesTotal = classifiedTotal;

    const unclassified = (data.expenses.unclassified ?? []).filter((tx) => hs.has(tx.holder));
    const uncTotal = unclassified.reduce((s, t) => s + t.amount, 0);
    expensesTotal += uncTotal;

    const skipped = (data.skipped ?? []).filter((e) => hs.has(e.holder));
    const net = incomeTotal - expensesTotal;

    return {
      ...data,
      income: { total: incomeTotal, items: incomeItems },
      expenses: { ...data.expenses, total: expensesTotal, classified_total: classifiedTotal, uncategorized_total: uncTotal, by_category: byCategory, unclassified },
      skipped,
      summary: { ...data.summary, total_income: incomeTotal, total_expenses: expensesTotal, classified_expenses: classifiedTotal, uncategorized_expenses: uncTotal, net },
    };
  }, [data, selectedHolders]);

  const bucketData = useMemo(() => {
    if (!filteredData) return [];
    const b = filteredData.budget_buckets;
    const income = filteredData.summary.total_income;
    const cats = filteredData.expenses.by_category;

    const sumCats = (names: string[]) =>
      Math.round(names.reduce((s, c) => s + (cats[c]?.total || 0), 0) * 100) / 100;

    const cfAmt = sumCats(b.custos_fixos.categories);
    const coAmt = sumCats(b.conforto.categories);
    const lfAmt = sumCats(b.liberdade_financeira.categories);

    const pct = (amt: number) => income > 0 ? Math.round((amt / income) * 10000) / 100 : 0;

    return [
      { name: "Custos Fixos", actual: pct(cfAmt), target: b.custos_fixos.target_pct, actualAmt: cfAmt, desiredAmt: Math.round(income * b.custos_fixos.target_pct) / 100 },
      { name: "Conforto", actual: pct(coAmt), target: b.conforto.target_pct, actualAmt: coAmt, desiredAmt: Math.round(income * b.conforto.target_pct) / 100 },
      { name: "Lib. Financeira", actual: pct(lfAmt), target: b.liberdade_financeira.target_pct, actualAmt: lfAmt, desiredAmt: Math.round(income * b.liberdade_financeira.target_pct) / 100 },
    ];
  }, [filteredData]);

  const { treeData, allKeys } = useMemo(() => {
    const d = filteredData;
    if (!d) return { treeData: [], allKeys: [] as string[] };
    const keys: string[] = [];
    const amt = showAmounts;
    const fmt = (v: number) => redacted ? REDACTED : formatBRL(v);

    const incomeNode: DataNode = {
      key: "income",
      title: (
        <Space>
          <Text strong>Income</Text>
          {amt && <Tag color="green">{fmt(d.income.total)}</Tag>}
        </Space>
      ),
      children: d.income.items.map((item, i) => {
        const k = `income-${i}`;
        keys.push(k);
        return {
          key: k,
          title: (
            <Space size={4}>
              <Text>{item.description}</Text>
              {amt && <Tag>{fmt(item.amount)}</Tag>}
              {item.provisional && <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>forecast</Tag>}
              <Text type="secondary" style={{ fontSize: 11 }}>
                {item.date || ""}
              </Text>
            </Space>
          ),
          isLeaf: true,
        };
      }),
    };
    keys.push("income");

    const buildCategoryNode = (catName: string, cat: typeof d.expenses.by_category[string]) => {
      const catKey = `cat-${catName}`;
      keys.push(catKey);

      const subChildren: DataNode[] = Object.entries(cat.subcategories)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([subName, sub]) => {
          const subKey = `sub-${catName}-${subName}`;
          keys.push(subKey);

          const txChildren: DataNode[] = sub.transactions.map((tx, i) => {
            const txKey = `tx-${catName}-${subName}-${i}`;
            keys.push(txKey);
            return {
              key: txKey,
              title: (
                <Space size={4}>
                  <Text>{tx.description}</Text>
                  {amt && <Tag>{fmt(tx.amount)}</Tag>}
                  {tx.provisional && <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>forecast</Tag>}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {tx.date || ""}{tx.source ? ` · ${tx.source === "Credit Card" ? "CC" : "Conta"}` : ""}
                  </Text>
                </Space>
              ),
              isLeaf: true,
            };
          });

          return {
            key: subKey,
            title: (
              <Space>
                <Text>{subName}</Text>
                {amt && <Tag>{fmt(sub.total)}</Tag>}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {sub.transactions.length} item{sub.transactions.length !== 1 ? "s" : ""}
                </Text>
              </Space>
            ),
            children: txChildren,
          };
        });

      return {
        key: catKey,
        title: (
          <Space>
            <Text strong>{catName}</Text>
            {amt && <Tag color="red">{fmt(cat.total)}</Tag>}
          </Space>
        ),
        children: subChildren,
      };
    };

    const buckets = [
      { key: "bucket-custos", label: "Custos Fixos (Essencial)", data: d.budget_buckets.custos_fixos },
      { key: "bucket-conforto", label: "Conforto (Estilo de vida)", data: d.budget_buckets.conforto },
      { key: "bucket-liberdade", label: "Liberdade Financeira", data: d.budget_buckets.liberdade_financeira },
    ];

    const categorizedInBuckets = new Set(buckets.flatMap((b) => b.data.categories));

    const bucketNodes: DataNode[] = buckets.map((bucket) => {
      const bKey = bucket.key;
      keys.push(bKey);
      const desiredAmount = Math.round(d.summary.total_income * bucket.data.target_pct) / 100;

      const matchingCategories = bucket.data.categories
        .filter((catName) => d.expenses.by_category[catName]);

      const sumFromCategories = matchingCategories.reduce(
        (sum, catName) => sum + (d.expenses.by_category[catName]?.total || 0), 0
      );
      const actualAmount = Math.round(sumFromCategories * 100) / 100;
      const actualPct = d.summary.total_income > 0
        ? Math.round((actualAmount / d.summary.total_income) * 10000) / 100
        : 0;

      const catChildren = matchingCategories
        .sort((a, b) => (d.expenses.by_category[b]?.total || 0) - (d.expenses.by_category[a]?.total || 0))
        .map((catName) => buildCategoryNode(catName, d.expenses.by_category[catName]));

      return {
        key: bKey,
        title: (
          <Space>
            <Text strong>{bucket.label}</Text>
            {amt && <Tag color="volcano">{fmt(actualAmount)}</Tag>}
            {amt && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {actualPct.toFixed(1)}% · desired: {fmt(desiredAmount)} ({bucket.data.target_pct}%)
              </Text>
            )}
          </Space>
        ),
        children: catChildren,
      };
    });

    const uncategorizedExpenses = Object.entries(d.expenses.by_category)
      .filter(([catName]) => !categorizedInBuckets.has(catName))
      .sort(([, a], [, b]) => b.total - a.total);

    if (uncategorizedExpenses.length > 0) {
      const otherKey = "bucket-other";
      keys.push(otherKey);
      const otherTotal = uncategorizedExpenses.reduce((s, [, c]) => s + c.total, 0);
      bucketNodes.push({
        key: otherKey,
        title: (
          <Space>
            <Text strong>Other</Text>
            {amt && <Tag color="orange">{fmt(otherTotal)}</Tag>}
          </Space>
        ),
        children: uncategorizedExpenses.map(([catName, cat]) => buildCategoryNode(catName, cat)),
      });
    }

    const unclassifiedList =
      d.expenses.unclassified ?? (d as any).unclassified ?? [];

    if (unclassifiedList.length > 0) {
      const ucKey = "bucket-unclassified";
      keys.push(ucKey);
      const ucTotal = unclassifiedList.reduce((s: number, t: any) => s + t.amount, 0);
      bucketNodes.push({
        key: ucKey,
        title: (
          <Space>
            <Text strong>Unclassified</Text>
            {amt && <Tag color="orange">{fmt(ucTotal)}</Tag>}
            <Text type="secondary" style={{ fontSize: 11 }}>{unclassifiedList.length} item{unclassifiedList.length !== 1 ? "s" : ""}</Text>
          </Space>
        ),
        children: unclassifiedList.map((tx: any, i: number) => {
          const k = `uc-${i}`;
          keys.push(k);
          return {
            key: k,
            title: (
              <Space size={4}>
                <Text>{tx.description}</Text>
                {amt && <Tag>{fmt(tx.amount)}</Tag>}
                <Text type="secondary" style={{ fontSize: 11 }}>{tx.date}</Text>
              </Space>
            ),
            isLeaf: true,
          };
        }),
      });
    }

    const expenseNode: DataNode = {
      key: "expenses",
      title: (
        <Space>
          <Text strong>Expenses</Text>
          {amt && <Tag color="red">{fmt(d.expenses.total)}</Tag>}
        </Space>
      ),
      children: bucketNodes,
    };
    keys.push("expenses");

    const nodes: DataNode[] = [incomeNode, expenseNode];

    if (d.skipped && d.skipped.length > 0) {
      const skKey = "skipped";
      keys.push(skKey);
      const skTotal = d.skipped.reduce((s, e) => s + e.amount, 0);
      nodes.push({
        key: skKey,
        title: (
          <Space>
            <Text strong>Skipped</Text>
            {amt && <Tag color="default">{fmt(skTotal)}</Tag>}
            <Text type="secondary" style={{ fontSize: 11 }}>{d.skipped.length} items</Text>
          </Space>
        ),
        children: d.skipped.map((entry, i) => {
          const k = `skipped-${i}`;
          keys.push(k);
          return {
            key: k,
            title: (
              <Space size={4}>
                <Text>{entry.description}</Text>
                {amt && <Tag>{fmt(entry.amount)}</Tag>}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {entry.date || ""}
                </Text>
              </Space>
            ),
            isLeaf: true,
          };
        }),
      });
    }

    return { treeData: nodes, allKeys: keys };
  }, [filteredData, showAmounts, redacted]);

  const filteredKeys = useMemo(() => {
    if (!search.trim() || !filteredData) return null;
    const term = search.toLowerCase();
    const matchKeys = new Set<string>();

    for (const item of filteredData.income.items) {
      if (item.description.toLowerCase().includes(term)) matchKeys.add("income");
    }

    for (const [catName, cat] of Object.entries(filteredData.expenses.by_category)) {
      for (const [subName, sub] of Object.entries(cat.subcategories)) {
        for (let i = 0; i < sub.transactions.length; i++) {
          const tx = sub.transactions[i];
          if (
            tx.description.toLowerCase().includes(term) ||
            catName.toLowerCase().includes(term) ||
            subName.toLowerCase().includes(term)
          ) {
            matchKeys.add("expenses");
            matchKeys.add(`cat-${catName}`);
            matchKeys.add(`sub-${catName}-${subName}`);
            matchKeys.add(`tx-${catName}-${subName}-${i}`);
          }
        }
      }
    }
    return matchKeys;
  }, [search, filteredData]);

  const visibleExpandedKeys = useMemo(() => {
    if (filteredKeys) return Array.from(filteredKeys);
    return expandedKeys;
  }, [filteredKeys, expandedKeys]);

  if (!data) {
    return <Empty description="Import a budget JSON file to view the tree" />;
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: "8px 16px" } }}>
        <Space wrap>
          {monthOptions.length > 1 && (
            <>
              <Text strong>Month:</Text>
              <Select
                value={selectedMonth || data.month}
                onChange={(v) => setSelectedMonth(v)}
                options={monthOptions}
                style={{ width: 180 }}
              />
            </>
          )}
          <Space size={4}>
            <Switch size="small" checked={showAmounts} onChange={setShowAmounts} />
            <Text type="secondary" style={{ fontSize: 12 }}>Amounts</Text>
          </Space>
          <Space size={4}>
            <Switch size="small" checked={redacted} onChange={setRedacted} />
            <Text type="secondary" style={{ fontSize: 12 }}>Redact</Text>
          </Space>
        </Space>
      </Card>

      <RedactContext.Provider value={redacted}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Total Income" value={redacted ? 0 : filteredData!.summary.total_income} precision={2} prefix={redacted ? "" : "R$"} formatter={(v) => redacted ? REDACTED : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} valueStyle={{ color: "#52c41a", fontSize: 18 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Total Expenses" value={redacted ? 0 : filteredData!.summary.total_expenses} precision={2} prefix={redacted ? "" : "R$"} formatter={(v) => redacted ? REDACTED : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} valueStyle={{ color: "#ff4d4f", fontSize: 18 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Net" value={redacted ? 0 : filteredData!.summary.net} precision={2} prefix={redacted ? "" : "R$"} formatter={(v) => redacted ? REDACTED : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} valueStyle={{ color: filteredData!.summary.net >= 0 ? "#52c41a" : "#ff4d4f", fontSize: 18 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Space direction="vertical" size={0}>
              <Statistic title="Investment" value={redacted ? 0 : filteredData!.summary.investment} precision={2} prefix={redacted ? "" : "R$"} formatter={(v) => redacted ? REDACTED : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} valueStyle={{ fontSize: 18 }} />
              <Text type="secondary" style={{ fontSize: 11 }}>desired: {redacted ? REDACTED : formatBRL(filteredData!.summary.investment_desired)}</Text>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={10}>
          <Card title="Budget Buckets — Actual vs Target" size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={bucketData} margin={{ left: 10, right: 20, top: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                <Tooltip content={<BucketTooltip />} />
                <Legend />
                <Bar dataKey="actual" name="Actual %" fill="#6366f1" barSize={40} radius={[4, 4, 0, 0]}>
                  {/* @ts-expect-error Recharts LabelList accepts content render */}
                  <LabelList dataKey="actualAmt" position="top" content={(props: { x?: number; y?: number; width?: number; value?: number }) => {
                    const { x = 0, y = 0, width = 0, value = 0 } = props;
                    return <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="#a0a0a0" fontSize={11}>{redacted ? REDACTED : formatBRL(value)}</text>;
                  }} />
                </Bar>
                <Line dataKey="target" name="Target %" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 5, fill: "#f59e0b", strokeWidth: 0 }}>
                  {/* @ts-expect-error Recharts LabelList accepts content render */}
                  <LabelList dataKey="desiredAmt" position="top" content={(props: { x?: number; y?: number; value?: number }) => {
                    const { x = 0, y = 0, value = 0 } = props;
                    return <text x={x} y={y - 10} textAnchor="middle" fill="#f59e0b" fontSize={10}>{redacted ? REDACTED : formatBRL(value)}</text>;
                  }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {data.notes && data.notes.length > 0 && (
            <Card title="Notes" size="small">
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {data.notes.map((note, i) => (
                  <li key={i} style={{ marginBottom: 4, fontSize: 13 }}>{note}</li>
                ))}
              </ul>
            </Card>
          )}
        </Col>

        <Col span={14}>
          <Card
            size="small"
            style={{ marginBottom: 12 }}
            styles={{ body: { padding: "8px 12px" } }}
          >
            <Space>
              <Search
                placeholder="Search transactions..."
                allowClear
                onChange={(e) => { setSearch(e.target.value); setAutoExpandParent(true); }}
                style={{ width: 280 }}
              />
              <button
                onClick={() => { setExpandedKeys(allKeys); setAutoExpandParent(false); }}
                style={{
                  border: `1px solid ${token.colorBorder}`, background: token.colorBgContainer,
                  borderRadius: token.borderRadius, padding: "4px 12px", cursor: "pointer", fontSize: 13,
                }}
              >
                Expand All
              </button>
              <button
                onClick={() => { setExpandedKeys([]); setAutoExpandParent(false); }}
                style={{
                  border: `1px solid ${token.colorBorder}`, background: token.colorBgContainer,
                  borderRadius: token.borderRadius, padding: "4px 12px", cursor: "pointer", fontSize: 13,
                }}
              >
                Collapse All
              </button>
            </Space>
          </Card>

          <Card size="small">
            <Tree
              showLine
              treeData={treeData}
              expandedKeys={visibleExpandedKeys}
              autoExpandParent={autoExpandParent}
              onExpand={(keys) => { setExpandedKeys(keys); setAutoExpandParent(false); }}
              style={{ fontSize: 13 }}
            />
          </Card>
        </Col>
      </Row>
      </RedactContext.Provider>
    </div>
  );
}
