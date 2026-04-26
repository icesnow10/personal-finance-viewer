import React, { useMemo } from "react";
import { Card, Input, InputNumber, Segmented, Select, Space, Typography, Button, theme } from "antd";
import { Search, XCircle } from "lucide-react";
import { getCategoryMeta } from "@/lib/category-meta";
import type { FlatTransaction } from "@/lib/types";

const { Text } = Typography;

export type ViewMode = "all" | "income" | "expense" | "unclassified" | "skipped";
export type ProvisionalFilter = "all" | "only" | "exclude";
export type InstallmentFilter = "all" | "only" | "exclude";

export interface TransactionFilters {
  search: string;
  viewMode: ViewMode;
  provisional: ProvisionalFilter;
  installment: InstallmentFilter;
  categories: string[];
  amountMin: number | null;
  amountMax: number | null;
}

export const DEFAULT_FILTERS: TransactionFilters = {
  search: "",
  viewMode: "all",
  provisional: "all",
  installment: "all",
  categories: [],
  amountMin: null,
  amountMax: null,
};

export function hasActiveFilters(f: TransactionFilters): boolean {
  return (
    f.search !== "" ||
    f.viewMode !== "all" ||
    f.provisional !== "all" ||
    f.installment !== "all" ||
    f.categories.length > 0 ||
    f.amountMin !== null ||
    f.amountMax !== null
  );
}

export function applyTransactionFilters(tx: FlatTransaction[], f: TransactionFilters): FlatTransaction[] {
  let result = tx;
  if (f.viewMode !== "all") result = result.filter((t) => t.type === f.viewMode);
  if (f.provisional === "only") result = result.filter((t) => t.provisional);
  else if (f.provisional === "exclude") result = result.filter((t) => !t.provisional);
  if (f.installment === "only") result = result.filter((t) => (t.totalInstallments ?? 0) >= 2);
  else if (f.installment === "exclude") result = result.filter((t) => (t.totalInstallments ?? 0) < 2);
  if (f.categories.length > 0) {
    const set = new Set(f.categories);
    result = result.filter((t) => set.has(t.category));
  }
  if (f.search.trim()) {
    const term = f.search.toLowerCase();
    result = result.filter(
      (t) =>
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        t.subcategory.toLowerCase().includes(term) ||
        (t.holder || "").toLowerCase().includes(term) ||
        (t.bank || "").toLowerCase().includes(term)
    );
  }
  if (f.amountMin !== null) result = result.filter((t) => Math.abs(t.amount) >= f.amountMin!);
  if (f.amountMax !== null) result = result.filter((t) => Math.abs(t.amount) <= f.amountMax!);
  return result;
}

export interface TransactionsFiltersProps {
  transactions: FlatTransaction[];
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  resultCount: number;
}

export function TransactionsFilters({ transactions, value, onChange, resultCount }: TransactionsFiltersProps) {
  const { token } = theme.useToken();

  const categoryOptions = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of transactions) {
      if (!t.category) continue;
      cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    }
    return Array.from(cats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => {
        const { emoji } = getCategoryMeta(name);
        return { label: `${emoji} ${name} (${count})`, value: name };
      });
  }, [transactions]);

  const set = <K extends keyof TransactionFilters>(k: K, v: TransactionFilters[K]) =>
    onChange({ ...value, [k]: v });

  const active = hasActiveFilters(value);

  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: "12px 16px" } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Input
          prefix={<Search size={14} color={token.colorTextSecondary} />}
          placeholder="Buscar transacoes..."
          allowClear
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          style={{ width: 300 }}
        />
        <Segmented
          value={value.viewMode}
          onChange={(v) => set("viewMode", v as ViewMode)}
          options={[
            { label: "Todas", value: "all" },
            { label: "Receitas", value: "income" },
            { label: "Despesas", value: "expense" },
            { label: "Sem Categoria", value: "unclassified" },
            { label: "Ignoradas", value: "skipped" },
          ]}
        />
        <Segmented
          value={value.provisional}
          onChange={(v) => set("provisional", v as ProvisionalFilter)}
          options={[
            { label: "Todas", value: "all" },
            { label: "Provisionados", value: "only" },
            { label: "Sem Provisao", value: "exclude" },
          ]}
        />
        <Segmented
          value={value.installment}
          onChange={(v) => set("installment", v as InstallmentFilter)}
          options={[
            { label: "Todas", value: "all" },
            { label: "Parceladas", value: "only" },
            { label: "A vista", value: "exclude" },
          ]}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Filtrar por categoria..."
          value={value.categories}
          onChange={(v) => set("categories", v)}
          options={categoryOptions}
          maxTagCount="responsive"
          style={{ minWidth: 220, maxWidth: 400 }}
          size="middle"
        />
        <Space size={4} style={{ alignItems: "center" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>R$</Text>
          <InputNumber
            placeholder="Min"
            value={value.amountMin}
            onChange={(v) => set("amountMin", v)}
            min={0}
            style={{ width: 90 }}
            size="small"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          <InputNumber
            placeholder="Max"
            value={value.amountMax}
            onChange={(v) => set("amountMax", v)}
            min={0}
            style={{ width: 90 }}
            size="small"
          />
        </Space>
        {active && (
          <Button
            type="text"
            size="small"
            icon={<XCircle size={14} />}
            onClick={() => onChange(DEFAULT_FILTERS)}
            style={{ color: token.colorTextSecondary }}
          >
            Limpar filtros
          </Button>
        )}
        <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
          {resultCount} transacoes
        </Text>
      </div>
    </Card>
  );
}
