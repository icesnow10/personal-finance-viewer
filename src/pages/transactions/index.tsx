import React, { useMemo, useState, useCallback } from "react";
import { Card, Typography, Space, Row, Col, Button, Modal } from "antd";
import { Download, RefreshCw, FileJson, Copy } from "lucide-react";
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
import { useRefresh, useRegisterRefresh } from "@/context/RefreshContext";
import { getBudgetSummary } from "@/lib/computations";
import { useIsMobile } from "@/hooks/useIsMobile";

const { Text, Title } = Typography;

export default function TransactionsV2Page() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const { redacted } = useRedact();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [jsonModal, setJsonModal] = useState<{ open: boolean; text: string; file: string; loading: boolean; error: string | null }>({
    open: false, text: "", file: "", loading: false, error: null,
  });
  const isMobile = useIsMobile();
  const { refreshing } = useRefresh();
  useRegisterRefresh(refresh, [refresh]);

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

  const openJsonSource = useCallback(async () => {
    const month = data?.month;
    if (!month) return;
    setJsonModal({ open: true, text: "", file: "", loading: true, error: null });
    try {
      const q = new URLSearchParams({ month });
      const household = (data as { household?: string })?.household;
      if (household) q.set("household", household);
      const res = await fetch(`/api/budget-source?${q.toString()}`);
      const file = res.headers.get("X-Source-File") || `budget_${month}.json`;
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || `HTTP ${res.status}`);
      let pretty = raw;
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* keep raw */ }
      setJsonModal({ open: true, text: pretty, file, loading: false, error: null });
    } catch (e) {
      setJsonModal({ open: true, text: "", file: "", loading: false, error: (e as Error).message });
    }
  }, [data]);

  if (loading) return null;
  if (!data) return <EmptyState />;

  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        marginBottom: isMobile ? 12 : 20,
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 10 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>Transacoes</Title>
        </div>
        <Space wrap style={isMobile ? { width: "100%", overflowX: "auto" } : undefined}>
          <MonthSelector months={monthPills} selected={data.month} onSelect={setSelectedMonth} />
          <Button icon={<Download size={14} />} onClick={handleExport} size="small">CSV</Button>
          <Button icon={<FileJson size={14} />} onClick={openJsonSource} size="small" title="Ver o JSON fonte deste mês">JSON</Button>
        </Space>
      </div>

      <Modal
        open={jsonModal.open}
        onCancel={() => setJsonModal((s) => ({ ...s, open: false }))}
        footer={null}
        width={860}
        title={
          <Space>
            <FileJson size={16} />
            <span>JSON fonte {jsonModal.file ? `· ${jsonModal.file}` : ""}</span>
            {jsonModal.text && (
              <Button
                size="small"
                icon={<Copy size={13} />}
                onClick={() => navigator.clipboard?.writeText(jsonModal.text)}
              >
                Copiar
              </Button>
            )}
          </Space>
        }
      >
        {jsonModal.loading ? (
          <Text type="secondary">Carregando…</Text>
        ) : jsonModal.error ? (
          <Text type="danger">{jsonModal.error}</Text>
        ) : (
          <pre
            style={{
              maxHeight: "65vh", overflow: "auto", margin: 0, fontSize: 12, lineHeight: 1.5,
              background: "rgba(127,127,127,0.08)", padding: 12, borderRadius: 8,
            }}
          >
            {jsonModal.text}
          </pre>
        )}
      </Modal>

      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={isMobile ? 12 : undefined} lg={undefined} flex={isMobile ? undefined : "1 1 0"}>
          <StatCard title="Receita" value={stats.income} valueColor="#52c41a" />
        </Col>
        <Col xs={12} sm={8} flex={isMobile ? undefined : "1 1 0"}>
          <StatCard title="Despesa" value={stats.expenses} valueColor="#ff4d4f" />
        </Col>
        <Col xs={12} sm={8} flex={isMobile ? undefined : "1 1 0"}>
          <StatCard title="Provisionado" value={stats.provisioned} valueColor="#722ed1" />
        </Col>
        <Col xs={12} sm={12} flex={isMobile ? undefined : "1 1 0"}>
          <StatCard title="Saldo" value={stats.net} valueColor={stats.net >= 0 ? "#52c41a" : "#ff4d4f"} />
        </Col>
        <Col xs={24} sm={12} flex={isMobile ? undefined : "1 1 0"}>
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
