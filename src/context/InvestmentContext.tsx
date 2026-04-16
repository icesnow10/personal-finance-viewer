import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { Investment } from "@/lib/investment-types";

interface InvestmentContextValue {
  investments: Investment[];
  setInvestments: React.Dispatch<React.SetStateAction<Investment[]>>;
  addInvestment: (inv: Investment) => void;
  updateInvestment: (key: string, inv: Investment) => void;
  deleteInvestment: (key: string) => void;
  clearAll: () => void;
}

export const InvestmentContext = createContext<InvestmentContextValue>({
  investments: [],
  setInvestments: () => {},
  addInvestment: () => {},
  updateInvestment: () => {},
  deleteInvestment: () => {},
  clearAll: () => {},
});

// Assign stable keys to rows coming from the API (filesystem JSON has no `key`).
function ensureKeys(rows: Investment[]): Investment[] {
  return rows.map((r, i) => ({
    ...r,
    key: r.key ?? `${r.month_year}-${r.broker}-${r.holder}-${r.nome}-${i}`,
  }));
}

export function InvestmentProvider({ children }: { children: React.ReactNode }) {
  const [investments, setInvestments] = useState<Investment[]>([]);

  useEffect(() => {
    fetch("/api/investments")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setInvestments(ensureKeys(data));
      })
      .catch(() => {
        // swallow — page renders empty state
      });
  }, []);

  const addInvestment = useCallback((inv: Investment) => {
    setInvestments((prev) => [...prev, inv]);
  }, []);

  const updateInvestment = useCallback((key: string, inv: Investment) => {
    setInvestments((prev) => prev.map((i) => (i.key === key ? inv : i)));
  }, []);

  const deleteInvestment = useCallback((key: string) => {
    setInvestments((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clearAll = useCallback(() => {
    setInvestments([]);
  }, []);

  const value = useMemo(
    () => ({ investments, setInvestments, addInvestment, updateInvestment, deleteInvestment, clearAll }),
    [investments, addInvestment, updateInvestment, deleteInvestment, clearAll]
  );

  return (
    <InvestmentContext.Provider value={value}>
      {children}
    </InvestmentContext.Provider>
  );
}
