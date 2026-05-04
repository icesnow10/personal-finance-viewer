import React, { useMemo } from "react";
import { Card, Table, Tag, Typography, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { formatBRL, REDACTED } from "@/lib/formatters";
import { getCategoryMeta, TYPE_COLORS } from "@/lib/category-meta";
import type { FlatTransaction } from "@/lib/types";

const { Text } = Typography;

const BANK_COLORS = ["blue", "green", "volcano", "purple", "cyan", "magenta", "gold", "geekblue", "orange"];
const ACCOUNT_COLORS = ["gold", "lime", "cyan", "purple", "magenta", "volcano", "geekblue", "orange", "green"];
const HOLDER_COLORS = ["magenta", "volcano", "orange", "gold", "green", "cyan", "blue", "geekblue", "purple"];

export interface TransactionsTableProps {
  transactions: FlatTransaction[];
  redacted?: boolean;
  rowSelection?: {
    selectedRowKeys: React.Key[];
    onChange: (keys: React.Key[]) => void;
  };
  pageSize?: number;
  showCard?: boolean;
}

export function TransactionsTable({
  transactions,
  redacted = false,
  rowSelection,
  pageSize = 200,
  showCard = true,
}: TransactionsTableProps) {
  const banks = useMemo(() => Array.from(new Set(transactions.map((t) => t.bank).filter(Boolean))) as string[], [transactions]);
  const accounts = useMemo(() => Array.from(new Set(transactions.map((t) => t.account_number).filter(Boolean))) as string[], [transactions]);
  const holders = useMemo(() => Array.from(new Set(transactions.map((t) => t.holder).filter(Boolean))) as string[], [transactions]);
  const types = useMemo(() => Array.from(new Set(transactions.map((t) => t.type))), [transactions]);

  const columns: ColumnsType<FlatTransaction> = useMemo(
    () => [
      {
        title: "Data",
        dataIndex: "date",
        key: "date",
        width: 110,
        sorter: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""),
        defaultSortOrder: "descend",
        render: (d: string) => (d ? <Text style={{ fontSize: 13 }}>{d}</Text> : <Text type="secondary">--</Text>),
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
        filters: banks.map((b) => ({ text: b, value: b })),
        sorter: (a, b) => (a.bank || "").localeCompare(b.bank || ""),
        onFilter: (value, record) => record.bank === value,
        render: (b: string) => {
          if (!b) return null;
          const color = BANK_COLORS[banks.indexOf(b) % BANK_COLORS.length];
          return <Tag color={color} style={{ fontSize: 11 }}>{b}</Tag>;
        },
      },
      {
        title: "Conta",
        dataIndex: "account_number",
        key: "account_number",
        width: 100,
        filters: accounts.map((n) => ({ text: n, value: n })),
        sorter: (a, b) => (a.account_number || "").localeCompare(b.account_number || ""),
        onFilter: (value, record) => record.account_number === value,
        render: (n: string) => {
          if (!n) return null;
          const color = ACCOUNT_COLORS[accounts.indexOf(n) % ACCOUNT_COLORS.length];
          return <Tag color={color} style={{ fontSize: 11 }}>{n}</Tag>;
        },
      },
      {
        title: "Titular",
        dataIndex: "holder",
        key: "holder",
        width: 110,
        filters: holders.map((h) => ({ text: h, value: h })),
        sorter: (a, b) => (a.holder || "").localeCompare(b.holder || ""),
        onFilter: (value, record) => record.holder === value,
        render: (h: string) => {
          if (!h) return null;
          const color = HOLDER_COLORS[holders.indexOf(h) % HOLDER_COLORS.length];
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
          const isRefund = record.type === "expense" && v < 0;
          const positive = isIncome || isRefund;
          return (
            <Text strong style={{ fontSize: 14, color: positive ? "#52c41a" : undefined }}>
              {redacted ? REDACTED : `${positive ? "+" : "-"} ${formatBRL(Math.abs(v))}`}
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
        filters: types.map((t) => ({ text: t.charAt(0).toUpperCase() + t.slice(1), value: t })),
        onFilter: (value, record) => record.type === value,
        render: (t: string) => (
          <Tag color={TYPE_COLORS[t] || "default"} style={{ fontSize: 10, textTransform: "uppercase" }}>
            {t}
          </Tag>
        ),
      },
    ],
    [banks, accounts, holders, types, redacted]
  );

  const tableEl = (
    <Table
      dataSource={transactions}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={{
        defaultPageSize: pageSize,
        pageSizeOptions: [50, 100, 200, 500, 1000],
        showSizeChanger: true,
        showTotal: (t) => `${t} itens`,
      }}
      scroll={{ x: 800 }}
      rowSelection={
        rowSelection
          ? {
              selectedRowKeys: rowSelection.selectedRowKeys,
              onChange: (keys) => rowSelection.onChange(keys),
              preserveSelectedRowKeys: true,
              selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
            }
          : undefined
      }
      rowClassName={(record) => {
        if (record.provisional) return "row-provisional";
        if (record.type === "income") return "row-income";
        if (record.type === "unclassified") return "row-uncategorized";
        return "";
      }}
    />
  );

  return showCard ? (
    <Card size="small" styles={{ body: { padding: 0 } }}>
      {tableEl}
    </Card>
  ) : (
    tableEl
  );
}
