import { useContext } from "react";
import { InvestmentContext } from "@/context/InvestmentContext";

export function useInvestments() {
  return useContext(InvestmentContext);
}
