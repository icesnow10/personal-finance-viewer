import React, { useMemo, useState, useCallback } from "react";
import {
  Card, Typography, Space, Tag, Input, InputNumber, Table, Row, Col,
  Segmented, theme, Button, Modal,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Search, Download, RefreshCw, Eye, EyeOff, XCircle } from "lucide-react";
import { useBudget } from "@/hooks/useBudget";
import { flattenTransactions } from "@/context/BudgetContext";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL, REDACTED } from "@/lib/formatters";
import { useRedact } from "@/context/RedactContext";
import { getCategoryMeta, TYPE_COLORS } from "@/lib/category-meta";
import { getBudgetSummary } from "@/lib/computations";
import type { FlatTransaction } from "@/lib/types";

const { Text, Title } = Typography;

type ViewMode = "all" | "income" | "expense" | "unclassified" | "skipped";
type ProvisionalFilter = "all" | "only" | "exclude";

const DEFAULT_VIEW: ViewMode = "all";
const DEFAULT_PROVISIONAL: ProvisionalFilter = "all";

export default function TransactionsV2Page() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const { redacted, toggle: toggleRedact } = useRedact();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW);
  const [provisionalFilter, setProvisionalFilter] = useState<ProvisionalFilter>(DEFAULT_PROVISIONAL);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { token } = theme.useToken();

  const hasActiveFilters = search !== "" || viewMode !== DEFAULT_VIEW || provisionalFilter !== DEFAULT_PROVISIONAL || amountMin !== null || amountMax !== null;

  const clearFilters = () => {
    setSearch("");
    setViewMode(DEFAULT_VIEW);
    setProvisionalFilter(DEFAULT_PROVISIONAL);
    setAmountMin(null);
    setAmountMax(null);
  };

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

  const filtered = useMemo(() => {
    let result = flatTx;

    if (viewMode !== "all") {
      result = result.filter((t) => t.type === viewMode);
    }

    if (provisionalFilter === "only") {
      result = result.filter((t) => t.provisional);
    } else if (provisionalFilter === "exclude") {
      result = result.filter((t) => !t.provisional);
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term) ||
          t.subcategory.toLowerCase().includes(term) ||
          (t.holder || "").toLowerCase().includes(term) ||
          (t.bank || "").toLowerCase().includes(term)
      );
    }

    if (amountMin !== null) {
      result = result.filter((t) => Math.abs(t.amount) >= amountMin);
    }
    if (amountMax !== null) {
      result = result.filter((t) => Math.abs(t.amount) <= amountMax);
    }

    return result;
  }, [flatTx, viewMode, provisionalFilter, search, amountMin, amountMax]);

  const stats = useMemo(() => {
    if (!data) return { income: 0, expenses: 0, net: 0, count: 0 };
    const summary = getBudgetSummary(data);
    return {
      income: summary.total_income,
      expenses: summary.total_expenses,
      net: summary.net,
      count: filtered.length,
    };
  }, [data, filtered]);

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

  const columns: ColumnsType<FlatTransaction> = useMemo(
    () => [
      {
        title: "Data",
        dataIndex: "date",
        key: "date",
        width: 110,
        sorter: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
        defaultSortOrder: "descend",
        render: (d: string) => {
          if (!d) return <Text type="secondary">--</Text>;
          return <Text style={{ fontSize: 13 }}>{d}</Text>;
        },
      },
      {
        title: "Descricao",
        dataIndex: "description",
        key: "description",
        ellipsis: true,
        sorter: (a, b) => a.description.localeCompare(b.description),
        render: (desc: string, record: FlatTransaction) => {
          const { emoji } = getCategoryMeta(record.category);
          return (
            <Space size={8}>
              <span style={{ fontSize: 14 }}>{emoji}</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>{desc}</Text>
                  {record.provisional && (
                    <Tag color="purple" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}>
                      Provisionado
                    </Tag>
                  )}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {record.category} &middot; {record.subcategory}
                </Text>
              </div>
            </Space>
          );
        },
      },
      {
        title: "ID",
        dataIndex: "id",
        key: "id",
        width: 280,
        sorter: (a, b) => (a.id || "").localeCompare(b.id || ""),
        render: (id: string) => (
          <Text copyable={{ text: id }} style={{ fontSize: 11, color: "#8c8c8c" }}>
            {id}
          </Text>
        ),
      },
      {
        title: "Banco",
        dataIndex: "bank",
        key: "bank",
        width: 100,
        filters: Array.from(new Set(flatTx.map((t) => t.bank).filter(Boolean))).map((b) => ({
          text: b!,
          value: b!,
        })),
        sorter: (a, b) => (a.bank || "").localeCompare(b.bank || ""),
        onFilter: (value, record) => record.bank === value,
        render: (b: string) => {
          if (!b) return null;
          const BANK_COLORS = ["blue", "green", "volcano", "purple", "cyan", "magenta", "gold", "geekblue", "orange"];
          const idx = Array.from(new Set(flatTx.map((t) => t.bank).filter(Boolean))).indexOf(b);
          const color = BANK_COLORS[idx % BANK_COLORS.length];
          return <Tag color={color} style={{ fontSize: 11 }}>{b}</Tag>;
        },
      },
      {
        title: "Conta",
        dataIndex: "account_number",
        key: "account_number",
        width: 100,
        sorter: (a, b) => (a.account_number || "").localeCompare(b.account_number || ""),
        filters: Array.from(new Set(flatTx.map((t) => t.account_number).filter(Boolean))).map((n) => ({
          text: n!,
          value: n!,
        })),
        onFilter: (value, record) => record.account_number === value,
        render: (n: string) => {
          if (!n) return null;
          const ACCOUNT_COLORS = ["gold", "lime", "cyan", "purple", "magenta", "volcano", "geekblue", "orange", "green"];
          const idx = Array.from(new Set(flatTx.map((t) => t.account_number).filter(Boolean))).indexOf(n);
          const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
          return <Tag color={color} style={{ fontSize: 11 }}>{n}</Tag>;
        },
      },
      {
        title: "Titular",
        dataIndex: "holder",
        key: "holder",
        width: 110,
        filters: Array.from(new Set(flatTx.map((t) => t.holder).filter(Boolean))).map((h) => ({
          text: h,
          value: h,
        })),
        sorter: (a, b) => (a.holder || "").localeCompare(b.holder || ""),
        onFilter: (value, record) => record.holder === value,
        render: (h: string) => {
          if (!h) return null;
          const HOLDER_COLORS = ["magenta", "volcano", "orange", "gold", "green", "cyan", "blue", "geekblue", "purple"];
          const idx = Array.from(new Set(flatTx.map((t) => t.holder).filter(Boolean))).indexOf(h);
          const color = HOLDER_COLORS[idx % HOLDER_COLORS.length];
          return <Tag color={color} style={{ fontSize: 11 }}>{h}</Tag>;
        },
      },
      {
        title: "Valor",
        dataIndex: "amount",
        key: "amount",
        width: 130,
        align: "right",
        sorter: (a, b) => a.amount - b.amount,
        render: (v: number, record: FlatTransaction) => {
          const isIncome = record.type === "income";
          return (
            <Text
              strong
              style={{
                fontSize: 14,
                color: isIncome ? "#52c41a" : undefined,
              }}
            >
              {redacted ? REDACTED : `${isIncome ? "+" : "-"} ${formatBRL(Math.abs(v))}`}
            </Text>
          );
        },
      },
      {
        title: "Tipo",
        dataIndex: "type",
        key: "type",
        width: 90,
        sorter: (a, b) => a.type.localeCompare(b.type),
        filters: Array.from(new Set(flatTx.map((t) => t.type))).map((t) => ({
          text: t.charAt(0).toUpperCase() + t.slice(1),
          value: t,
        })),
        onFilter: (value, record) => record.type === value,
        render: (t: string) => (
          <Tag
            color={TYPE_COLORS[t] || "default"}
            style={{ fontSize: 10, textTransform: "uppercase" }}
          >
            {t}
          </Tag>
        ),
      },
    ],
    [flatTx, redacted]
  );

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
        <Col span={6}>
          <StatCard title="Receita" value={stats.income} valueColor="#52c41a" />
        </Col>
        <Col span={6}>
          <StatCard title="Despesa" value={stats.expenses} valueColor="#ff4d4f" />
        </Col>
        <Col span={6}>
          <StatCard title="Saldo" value={stats.net} valueColor={stats.net >= 0 ? "#52c41a" : "#ff4d4f"} />
        </Col>
        <Col span={6}>
          <StatCard title="Transacoes" value={stats.count} prefix="" precision={0} />
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: "12px 16px" } }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Input
            prefix={<Search size={14} color={token.colorTextSecondary} />}
            placeholder="Buscar transacoes..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: "Todas", value: "all" },
              { label: "Receitas", value: "income" },
              { label: "Despesas", value: "expense" },
              { label: "Sem Categoria", value: "unclassified" },
              { label: "Ignoradas", value: "skipped" },
            ]}
          />
          <Segmented
            value={provisionalFilter}
            onChange={(v) => setProvisionalFilter(v as ProvisionalFilter)}
            options={[
              { label: "Todas", value: "all" },
              { label: "Provisionados", value: "only" },
              { label: "Sem Provisao", value: "exclude" },
            ]}
          />
          <Space size={4} style={{ alignItems: "center" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>R$</Text>
            <InputNumber
              placeholder="Min"
              value={amountMin}
              onChange={(v) => setAmountMin(v)}
              min={0}
              style={{ width: 90 }}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
            <InputNumber
              placeholder="Max"
              value={amountMax}
              onChange={(v) => setAmountMax(v)}
              min={0}
              style={{ width: 90 }}
              size="small"
            />
          </Space>
          {hasActiveFilters && (
            <Button
              type="text"
              size="small"
              icon={<XCircle size={14} />}
              onClick={clearFilters}
              style={{ color: token.colorTextSecondary }}
            >
              Limpar filtros
            </Button>
          )}
          <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
            {filtered.length} transacoes
          </Text>
        </div>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (t) => `${t} itens` }}
          scroll={{ x: 800 }}
          rowClassName={(record) => {
            if (record.provisional) return "row-provisional";
            if (record.type === "income") return "row-income";
            if (record.type === "unclassified") return "row-uncategorized";
            return "";
          }}
        />
      </Card>

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
