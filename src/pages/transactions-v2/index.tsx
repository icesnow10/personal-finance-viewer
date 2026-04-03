import React, { useMemo, useState, useCallback } from "react";
import {
  Card, Typography, Space, Tag, Input, Select, Table, Row, Col,
  Segmented, theme, Button, Modal,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Search, X, Filter, Download, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useBudget } from "@/hooks/useBudget";
import { flattenTransactions } from "@/context/BudgetContext";
import { MonthSelector } from "@/components/shared/MonthSelector";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL, formatMonth, REDACTED } from "@/lib/formatters";
import { useRedact } from "@/context/RedactContext";
import { getCategoryMeta, HOLDER_COLORS, TYPE_COLORS } from "@/lib/category-meta";
import type { FlatTransaction } from "@/lib/types";

const { Text, Title } = Typography;

type ViewMode = "all" | "income" | "expense" | "unclassified";
type ProvisionalFilter = "all" | "only" | "exclude";

export default function TransactionsV2Page() {
  const { data: activeData, allMonths, loading, refresh } = useBudget();
  const { redacted, toggle: toggleRedact } = useRedact();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [provisionalFilter, setProvisionalFilter] = useState<ProvisionalFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const { token } = theme.useToken();

  const monthPills = useMemo(
    () => allMonths.map((m) => ({ month: m.month, net: m.summary.net })),
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
          (t.holder || "").toLowerCase().includes(term)
      );
    }

    return result;
  }, [flatTx, viewMode, provisionalFilter, search]);

  const stats = useMemo(() => {
    if (!data) return { income: 0, expenses: 0, net: 0, count: 0 };
    return {
      income: data.summary.total_income,
      expenses: data.summary.total_expenses,
      net: data.summary.net,
      count: filtered.length,
    };
  }, [data, filtered]);

  const handleExport = useCallback(() => {
    if (!filtered.length) return;
    const headers = ["Date", "Description", "Amount", "Category", "Subcategory", "Holder", "Type"];
    const csv = [
      headers.join(","),
      ...filtered.map((t) =>
        [t.date, `"${t.description}"`, t.amount, t.category, t.subcategory, t.holder, t.type].join(",")
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
        width: 100,
        sorter: (a, b) => a.date.localeCompare(b.date),
        render: (d: string) => {
          if (!d) return <Text type="secondary">--</Text>;
          const parts = d.split("-");
          return (
            <Text style={{ fontSize: 13 }}>
              {parts[2]}/{parts[1]}
            </Text>
          );
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
        title: "Titular",
        dataIndex: "holder",
        key: "holder",
        width: 90,
        filters: Array.from(new Set(flatTx.map((t) => t.holder).filter(Boolean))).map((h) => ({
          text: h,
          value: h,
        })),
        onFilter: (value, record) => record.holder === value,
        render: (h: string) =>
          h ? <Tag color={HOLDER_COLORS[h] || "default"} style={{ fontSize: 11 }}>{h}</Tag> : null,
      },
      {
        title: "Valor",
        dataIndex: "amount",
        key: "amount",
        width: 130,
        align: "right",
        sorter: (a, b) => a.amount - b.amount,
        defaultSortOrder: "descend",
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
    [flatTx]
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
            ]}
          />
          <Select
            value={provisionalFilter}
            onChange={(v) => setProvisionalFilter(v)}
            size="small"
            style={{ width: 160 }}
            options={[
              { label: "Provisionados: Todos", value: "all" },
              { label: "Apenas provisionados", value: "only" },
              { label: "Excluir provisionados", value: "exclude" },
            ]}
          />
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
