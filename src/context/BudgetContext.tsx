import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { BudgetData, FlatTransaction } from "@/lib/types";

interface BudgetContextValue {
  data: BudgetData | null;
  allMonths: BudgetData[];
  flatTransactions: FlatTransaction[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export const BudgetContext = createContext<BudgetContextValue>({
  data: null,
  allMonths: [],
  flatTransactions: [],
  loading: true,
  refresh: async () => {},
});

export function flattenTransactions(data: BudgetData): FlatTransaction[] {
  if (Array.isArray(data.transactions) && data.transactions.length > 0) {
    return data.transactions.map((tx, index) => ({
      id: tx.id || `tx-${index}`,
      date: tx.date || "",
      description: tx.description,
      amount: tx.amount,
      source: tx.source,
      holder: tx.holder,
      bank: tx.bank,
      account_number: tx.account_number,
      bucket: tx.bucket ?? undefined,
      pluggy_item_id: tx.pluggy_item_id ?? undefined,
      pluggy_id: tx.pluggy_id ?? undefined,
      category:
        tx.type === "income"
          ? "Income"
          : tx.type === "skipped"
            ? "Skipped"
            : tx.type === "unclassified"
              ? "Uncategorized"
              : tx.category || "Uncategorized",
      subcategory:
        tx.type === "income"
          ? tx.source || "Income"
          : tx.type === "skipped"
            ? tx.subcategory || "Internal Transfer"
            : tx.type === "unclassified"
              ? tx.subcategory || "Unknown"
              : tx.subcategory || "Unknown",
      type: tx.type,
      ...(tx.provisional ? { provisional: true } : {}),
    }));
  }

  const result: FlatTransaction[] = [];
  let idx = 0;

  for (const item of data.income?.items ?? []) {
    const isProvisional = item.provisional ?? (item.details?.provisional === true);
    result.push({
      id: `tx-${idx++}`,
      date: item.date || "",
      description: item.description,
      amount: item.amount,
      source: item.source,
      holder: item.holder,
      bank: item.bank,
      account_number: item.account_number,
      category: "Income",
      subcategory: item.source || "Income",
      type: "income",
      ...(isProvisional ? { provisional: true } : {}),
    });
  }

  for (const [category, catData] of Object.entries(data.expenses?.by_category ?? {})) {
    for (const [subcategory, subData] of Object.entries(catData?.subcategories ?? {})) {
      for (const tx of subData?.transactions ?? []) {
        result.push({
          ...tx,
          id: `tx-${idx++}`,
          category,
          subcategory,
          type: "expense",
          ...(tx.provisional ? { provisional: true } : {}),
        });
      }
    }
  }

  const unclassifiedList =
    data.expenses.unclassified ?? (data as any).unclassified ?? [];

  for (const tx of unclassifiedList) {
    result.push({
      ...tx,
      id: `tx-${idx++}`,
      category: "Uncategorized",
      subcategory: tx.guess || "Unknown",
      type: "unclassified",
    });
  }

  if (data.skipped) {
    for (const entry of data.skipped) {
      result.push({
        id: `tx-${idx++}`,
        date: entry.date,
        description: entry.description,
        amount: entry.amount,
        holder: entry.holder,
        bank: entry.bank,
        account_number: entry.account_number,
        category: "Skipped",
        subcategory: "Internal Transfer",
        type: "skipped",
      });
    }
  }

  return result;
}

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [allMonths, setAllMonths] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/budgets");
      if (res.ok) {
        const months: BudgetData[] = await res.json();
        setAllMonths(months);
      }
    } catch {
      // fetch failed — keep current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const data = useMemo(() => {
    if (allMonths.length === 0) return null;
    return allMonths[allMonths.length - 1];
  }, [allMonths]);

  const flatTransactions = useMemo(() => {
    if (!data) return [];
    return flattenTransactions(data);
  }, [data]);

  const value = useMemo(
    () => ({ data, allMonths, flatTransactions, loading, refresh: fetchBudgets }),
    [data, allMonths, flatTransactions, loading, fetchBudgets]
  );

  return (
    <BudgetContext.Provider value={value}>
      {children}
    </BudgetContext.Provider>
  );
}
