import type { BudgetData, CategoryData } from "./types";

export interface MonthlyTotal {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export function getMonthlyTotals(months: BudgetData[]): MonthlyTotal[] {
  return months
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      income: m.summary.total_income,
      expenses: m.summary.total_expenses,
      net: m.summary.net,
    }));
}

export interface CategoryTotal {
  category: string;
  amount: number;
  subcategories: { name: string; amount: number }[];
}

export function getCategoryTotals(data: BudgetData): CategoryTotal[] {
  return Object.entries(data.expenses.by_category)
    .map(([category, cat]) => ({
      category,
      amount: cat.total,
      subcategories: Object.entries(cat.subcategories)
        .map(([name, sub]) => ({ name, amount: sub.total }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface CategoryComparison {
  category: string;
  amount: number;
  previousAmount: number | null;
  variation: number | null;
}

export function getCategoryComparison(
  current: BudgetData,
  previous: BudgetData | null
): CategoryComparison[] {
  const currentCats = getCategoryTotals(current);
  const prevMap = previous
    ? Object.fromEntries(
        Object.entries(previous.expenses.by_category).map(([k, v]) => [k, v.total])
      )
    : null;

  return currentCats.map((c) => {
    const prevAmount = prevMap ? prevMap[c.category] ?? null : null;
    return {
      category: c.category,
      amount: c.amount,
      previousAmount: prevAmount,
      variation:
        prevAmount != null && prevAmount > 0
          ? ((c.amount - prevAmount) / prevAmount) * 100
          : null,
    };
  });
}

export interface SpendingPace {
  totalSpent: number;
  dailyAvg: number;
  projectedTotal: number;
  daysElapsed: number;
  daysInMonth: number;
  previousMonthTotal: number | null;
  variationVsPrevious: number | null;
}

export function getSpendingPace(
  data: BudgetData,
  previousMonth: BudgetData | null
): SpendingPace {
  const [year, month] = data.month.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let daysElapsed: number;
  if (data.data_through) {
    const throughDate = new Date(data.data_through);
    daysElapsed = throughDate.getDate();
  } else if (data.partial) {
    // estimate from transaction dates
    const dates = getAllTransactionDates(data);
    if (dates.length > 0) {
      const maxDay = Math.max(...dates.map((d) => new Date(d).getDate()));
      daysElapsed = maxDay;
    } else {
      daysElapsed = daysInMonth;
    }
  } else {
    daysElapsed = daysInMonth;
  }

  const totalSpent = data.summary.total_expenses;
  const dailyAvg = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const projectedTotal = dailyAvg * daysInMonth;
  const previousMonthTotal = previousMonth?.summary.total_expenses ?? null;
  const variationVsPrevious =
    previousMonthTotal != null && previousMonthTotal > 0
      ? ((totalSpent - previousMonthTotal) / previousMonthTotal) * 100
      : null;

  return {
    totalSpent,
    dailyAvg,
    projectedTotal,
    daysElapsed,
    daysInMonth,
    previousMonthTotal,
    variationVsPrevious,
  };
}

function getAllTransactionDates(data: BudgetData): string[] {
  const dates: string[] = [];
  for (const cat of Object.values(data.expenses.by_category)) {
    for (const sub of Object.values(cat.subcategories)) {
      for (const tx of sub.transactions) {
        if (tx.date) dates.push(tx.date);
      }
    }
  }
  return dates;
}

export interface DailySpending {
  day: number;
  cumulative: number;
}

export function getDailySpendingCurve(data: BudgetData): DailySpending[] {
  const expenses: { day: number; amount: number }[] = [];

  for (const cat of Object.values(data.expenses.by_category)) {
    for (const sub of Object.values(cat.subcategories)) {
      for (const tx of sub.transactions) {
        if (tx.date) {
          const day = new Date(tx.date).getDate();
          expenses.push({ day, amount: tx.amount });
        }
      }
    }
  }
  for (const tx of data.expenses.unclassified ?? []) {
    if (tx.date) {
      const day = new Date(tx.date).getDate();
      expenses.push({ day, amount: tx.amount });
    }
  }

  expenses.sort((a, b) => a.day - b.day);

  const dailyMap = new Map<number, number>();
  for (const e of expenses) {
    dailyMap.set(e.day, (dailyMap.get(e.day) || 0) + e.amount);
  }

  const [year, month] = data.month.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: DailySpending[] = [];
  let cumulative = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    cumulative += dailyMap.get(d) || 0;
    result.push({ day: d, cumulative: Math.round(cumulative * 100) / 100 });
  }

  return result;
}

export interface RecurringTransaction {
  description: string;
  category: string;
  subcategory: string;
  avgAmount: number;
  months: string[];
  isFixed: boolean;
}

export function getRecurringTransactions(
  allMonths: BudgetData[]
): RecurringTransaction[] {
  const txMap = new Map<
    string,
    { category: string; subcategory: string; amounts: number[]; months: string[] }
  >();

  const fixedCategories = new Set([
    "Housing", "Insurance", "Subscriptions", "Health",
  ]);

  for (const monthData of allMonths) {
    for (const [catName, cat] of Object.entries(monthData.expenses.by_category)) {
      for (const [subName, sub] of Object.entries(cat.subcategories)) {
        for (const tx of sub.transactions) {
          const key = tx.description.toLowerCase().trim();
          if (!txMap.has(key)) {
            txMap.set(key, {
              category: catName,
              subcategory: subName,
              amounts: [],
              months: [],
            });
          }
          const entry = txMap.get(key)!;
          if (!entry.months.includes(monthData.month)) {
            entry.amounts.push(tx.amount);
            entry.months.push(monthData.month);
          }
        }
      }
    }
  }

  return Array.from(txMap.entries())
    .filter(([, v]) => v.months.length >= 2)
    .map(([desc, v]) => ({
      description: desc,
      category: v.category,
      subcategory: v.subcategory,
      avgAmount:
        Math.round((v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length) * 100) /
        100,
      months: v.months.sort(),
      isFixed: fixedCategories.has(v.category),
    }))
    .sort((a, b) => b.avgAmount - a.avgAmount);
}

export interface IncomeByMonth {
  month: string;
  items: { description: string; holder: string; source: string; amount: number }[];
  total: number;
}

export function getIncomeByMonth(allMonths: BudgetData[]): IncomeByMonth[] {
  return allMonths
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      items: m.income.items.map((i) => ({
        description: i.description,
        holder: i.holder,
        source: i.source,
        amount: i.amount,
      })),
      total: m.income.total,
    }));
}

export interface BucketProgress {
  name: string;
  key: string;
  targetPct: number;
  actualPct: number;
  actualAmount: number;
  targetAmount: number;
  delta: number;
  categories: string[];
}

export function getBucketProgress(data: BudgetData): BucketProgress[] {
  const income = data.summary.total_income;
  const cats = data.expenses.by_category;

  const sumCats = (names: string[]) =>
    Math.round(names.reduce((s, c) => s + (cats[c]?.total || 0), 0) * 100) / 100;

  const buckets = [
    { name: "Custos Fixos", key: "custos_fixos", data: data.budget_buckets.custos_fixos },
    { name: "Conforto", key: "conforto", data: data.budget_buckets.conforto },
    {
      name: "Liberdade Financeira",
      key: "liberdade_financeira",
      data: data.budget_buckets.liberdade_financeira,
    },
  ];

  return buckets.map((b) => {
    const actualAmount = sumCats(b.data.categories);
    const actualPct =
      income > 0 ? Math.round((actualAmount / income) * 10000) / 100 : 0;
    const targetAmount = Math.round(income * b.data.target_pct) / 100;

    return {
      name: b.name,
      key: b.key,
      targetPct: b.data.target_pct,
      actualPct,
      actualAmount,
      targetAmount,
      delta: Math.round((actualPct - b.data.target_pct) * 100) / 100,
      categories: b.data.categories,
    };
  });
}
