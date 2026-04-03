import { useContext } from "react";
import { BudgetContext } from "@/context/BudgetContext";

export function useBudget() {
  return useContext(BudgetContext);
}
