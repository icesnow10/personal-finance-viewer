import React, { useMemo, useState, useCallback } from "react";
import { Card, Typography, Space, Row, Col, Button, Modal } from "antd";
import { Download, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useBudget } from "@/hooks/useBudget";
import { flattenTransactions } from "@/context/BudgetContext";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { TransactionsTable } from "@/components/shared/TransactionsTable";
import {
  TransactionsFilters,
  applyTransactionFilters,
  DEFAULT_FILTERS,
  type TransactionFilters,
} from "@/components/shared/TransactionsFilters";
import { formatBRL, REDACTED } from "@/lib/formatters";
import { useRedact } from "@/context/RedactContext";
import { getBudgetSummary } from "@/lib/computations";

const { Text, Title } = Typography;

export default function TransactionsV2Page() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const { redacted, toggle: toggleRedact } = useRedact();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const monthPills = useMemo(
    () => allMonths.map((m) => ({ month: m.month, net: getBudgetSummary(m).net })),
    [allMonths]
  );

  const data = useMemo(() => {
    if (selectedMonth) {
      return allMonths.find((m) => m.month === selectedMonth) || activeData;
    }
    return activeData;
  }, [selectedMonth, allMonths, activeData]);

  const flatTx = useMemo(() => {
    if (!data) return [];
    return flattenTransactions(data);
  }, [data]);

  const filtered = useMemo(() => applyTransactionFilters(flatTx, filters), [flatTx, filters]);

  const selectionSummary = useMemo(() => {
    if (selectedRowKeys.length === 0) return null;
    const keySet = new Set(selectedRowKeys);
    let income = 0;
    let expense = 0;
    let count = 0;
    for (const t of filtered) {
      if (!keySet.has(t.id)) continue;
      count++;
      if (t.type === "income") income += Math.abs(t.amount);
      else expense += Math.abs(t.amount);
    }
    return { count, income, expense, net: income - expense };
  }, [selectedRowKeys, filtered]);

  const stats = useMemo(() => {
    if (!data) return { income: 0, expenses: 0, net: 0, count: 0, provisioned: 0 };
    const summary = getBudgetSummary(data);
    let provisioned = 0;
    for (const t of flatTx) {
      if (t.type === "expense" && t.provisional) provisioned += t.amount;
    }
    return {
      income: summary.total_income,
      expenses: summary.total_expenses - provisioned,
      net: summary.net,
      count: filtered.length,
      provisioned,
    };
  }, [data, filtered, flatTx]);

  const handleExport = useCallback(() => {
    if (!filtered.length) return;
    const headers = ["Date", "Description", "Amount", "Category", "Subcategory", "Bank", "Account", "Holder", "Type"];
    const csv = [
      headers.join(","),
      ...filtered.map((t) =>
        [t.date, `"${t.description}"`, t.amount, t.category, t.subcategory, t.bank || "", t.account_number || "", t.holder, t.type].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${data?.month || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, data]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (loading) return null;
  if (!data) return <EmptyState />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>Transacoes</Title>
          <RefreshCw
            size={16}
            color="#8c8c8c"
            style={{ cursor: "pointer", animation: refreshing ? "spin 1s linear infinite" : undefined }}
            onClick={handleRefresh}
          />
          {redacted ? (
            <EyeOff size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
          ) : (
            <Eye size={16} color="#8c8c8c" style={{ cursor: "pointer" }} onClick={toggleRedact} />
          )}
        </div>
        <Space>
          <MonthSelector months={monthPills} selected={data.month} onSelect={setSelectedMonth} />
          <Button icon={<Download size={14} />} onClick={handleExport} size="small">CSV</Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col flex="1 1 0">
          <StatCard title="Receita" value={stats.income} valueColor="#52c41a" />
        </Col>
        <Col flex="1 1 0">
          <StatCard title="Despesa" value={stats.expenses} valueColor="#ff4d4f" />
        </Col>
        <Col flex="1 1 0">
          <StatCard title="Provisionado" value={stats.provisioned} valueColor="#722ed1" />
        </Col>
        <Col flex="1 1 0">
          <StatCard title="Saldo" value={stats.net} valueColor={stats.net >= 0 ? "#52c41a" : "#ff4d4f"} />
        </Col>
        <Col flex="1 1 0">
          <StatCard title="Transacoes" value={stats.count} prefix="" precision={0} />
        </Col>
      </Row>

      <TransactionsFilters
        transactions={flatTx}
        value={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {selectionSummary && (
        <Card
          size="small"
          style={{ marginBottom: 12, background: "rgba(99,102,241,0.08)", borderColor: "rgba(99,102,241,0.3)" }}
          styles={{ body: { padding: "10px 16px" } }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <Text strong style={{ color: "#6366f1" }}>
              {selectionSummary.count} selecionadas
            </Text>
            {selectionSummary.income > 0 && (
              <span style={{ fontSize: 13 }}>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 6 }}>Receita</Text>
                <Text strong style={{ color: "#52c41a" }}>
                  {redacted ? REDACTED : `+${formatBRL(selectionSummary.income)}`}
                </Text>
              </span>
            )}
            {selectionSummary.expense > 0 && (
              <span style={{ fontSize: 13 }}>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 6 }}>Despesa</Text>
                <Text strong style={{ color: "#ff4d4f" }}>
                  {redacted ? REDACTED : `-${formatBRL(selectionSummary.expense)}`}
                </Text>
              </span>
            )}
            <span style={{ fontSize: 13 }}>
              <Text type="secondary" style={{ fontSize: 11, marginRight: 6 }}>Saldo</Text>
              <Text strong style={{ color: selectionSummary.net >= 0 ? "#52c41a" : "#ff4d4f" }}>
                {redacted ? REDACTED : formatBRL(selectionSummary.net)}
              </Text>
            </span>
            <Button
              size="small"
              type="text"
              onClick={() => setSelectedRowKeys(filtered.map((t) => t.id))}
              style={{ marginLeft: "auto" }}
            >
              Selecionar todas ({filtered.length})
            </Button>
            <Button size="small" type="text" onClick={() => setSelectedRowKeys([])}>
              Limpar
            </Button>
          </div>
        </Card>
      )}

      <TransactionsTable
        transactions={filtered}
        redacted={redacted}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
      />

      <Modal
        open={refreshing}
        closable={false}
        footer={null}
        centered
        width={320}
        styles={{ body: { textAlign: "center", padding: "32px 24px" } }}
      >
        <RefreshCw size={28} color="#6366f1" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Recarregando arquivos...</div>
        <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>Lendo resources/*.json</div>
      </Modal>

      <style jsx global>{`
        .row-income { background: rgba(82, 196, 26, 0.04) !important; }
        .row-income:hover > td { background: rgba(82, 196, 26, 0.08) !important; }
        .row-uncategorized { background: rgba(255, 165, 0, 0.04) !important; }
        .row-uncategorized:hover > td { background: rgba(255, 165, 0, 0.08) !important; }
        .row-provisional { background: rgba(114, 46, 209, 0.04) !important; }
        .row-provisional:hover > td { background: rgba(114, 46, 209, 0.08) !important; }
      `}</style>
    </div>
  );
}
