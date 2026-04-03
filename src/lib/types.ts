export interface BudgetData {
  month: string;
  partial?: boolean;
  data_through?: string;
  currency: string;
  income: {
    total: number;
    items: IncomeItem[];
  };
  intentional_rdb_investments?: {
    description: string;
    total: number;
    entries: { date: string; amount: number; holder: string }[];
  };
  skipped?: { description: string; date: string; amount: number; holder: string }[];
  expenses: {
    total: number;
    classified_total: number;
    uncategorized_total: number;
    by_category: Record<string, CategoryData>;
    unclassified: Transaction[];
  };
  summary: {
    total_income: number;
    total_expenses: number;
    classified_expenses: number;
    uncategorized_expenses: number;
    net: number;
    investment: number;
    investment_pct: number;
    investment_desired: number;
    intentional_rdb_investments?: number;
  };
  budget_buckets: {
    custos_fixos: BucketData;
    conforto: BucketData;
    liberdade_financeira: BucketData;
  };
  notes: string[];
}

export interface IncomeItem {
  description: string;
  amount: number;
  date: string | null;
  source: string;
  holder: string;
  provisional?: boolean;
  details?: Record<string, unknown>;
}

export interface CategoryData {
  total: number;
  subcategories: Record<string, SubcategoryData>;
}

export interface SubcategoryData {
  total: number;
  entries_count?: number;
  transactions: Transaction[];
}

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  source?: string;
  holder: string;
  guess?: string;
  category?: string;
  subcategory?: string;
  provisional?: boolean;
}

export interface BucketData {
  target_pct: number;
  categories: string[];
  actual_amount: number;
  actual_pct: number;
  delta_pp: number;
  investment?: number;
  investment_pct?: number;
  investment_desired?: number;
}

export type TransactionType = "income" | "expense" | "unclassified" | "skipped";

export interface FlatTransaction extends Transaction {
  id: string;
  category: string;
  subcategory: string;
  type: TransactionType;
  provisional?: boolean;
}
