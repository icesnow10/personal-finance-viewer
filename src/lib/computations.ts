import type { BucketData, BudgetData, CategoryData } from "./types";

export interface BudgetSummary {
  total_income: number;
  total_expenses: number;
  classified_expenses: number;
  uncategorized_expenses: number;
  net: number;
  investment: number;
  investment_pct: number;
  investment_desired: number;
  intentional_rdb_investments?: number;
}

export interface BudgetBuckets {
  custos_fixos: BucketData;
  conforto: BucketData;
  liberdade_financeira: BucketData;
}

const DEFAULT_BUCKETS: BudgetBuckets = {
  custos_fixos: {
    target_pct: 30,
    categories: ["Housing", "Health", "Insurance", "Groceries", "Transportation"],
    actual_amount: 0,
    actual_pct: 0,
    delta_pp: 0,
  },
  conforto: {
    target_pct: 25,
    categories: [
      "Wellness",
      "Subscriptions",
      "Personal Care",
      "Services",
      "Food/Dining",
      "Recreation",
      "Shopping",
      "Travel",
      "Family Support",
      "Education",
    ],
    actual_amount: 0,
    actual_pct: 0,
    delta_pp: 0,
  },
  liberdade_financeira: {
    target_pct: 45,
    categories: ["Investment (Troco Turbo)", "Net"],
    actual_amount: 0,
    actual_pct: 0,
    delta_pp: 0,
  },
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getBudgetSummary(data: BudgetData): BudgetSummary {
  const totalIncome = roundMoney(
    data.income?.total ??
      (data.income?.items ?? []).reduce((sum, item) => sum + item.amount, 0)
  );
  const classifiedExpenses = roundMoney(
    Object.values(data.expenses?.by_category ?? {}).reduce(
      (sum, category) => sum + category.total,
      0
    )
  );
  const uncategorizedExpenses = roundMoney(
    (data.expenses?.unclassified ?? []).reduce((sum, tx) => sum + tx.amount, 0)
  );
  const totalExpenses = roundMoney(classifiedExpenses + uncategorizedExpenses);
  const net = roundMoney(totalIncome - totalExpenses);
  const intentionalRdb = roundMoney(data.intentional_rdb_investments?.total ?? 0);

  if (data.summary) {
    return {
      total_income: data.summary.total_income ?? totalIncome,
      total_expenses: data.summary.total_expenses ?? totalExpenses,
      classified_expenses: data.summary.classified_expenses ?? classifiedExpenses,
      uncategorized_expenses:
        data.summary.uncategorized_expenses ?? uncategorizedExpenses,
      net: data.summary.net ?? net,
      investment: data.summary.investment ?? net,
      investment_pct:
        data.summary.investment_pct ??
        (totalIncome > 0 ? roundPct((net / totalIncome) * 100) : 0),
      investment_desired:
        data.summary.investment_desired ?? roundMoney(totalIncome * 0.45),
      ...(intentionalRdb || data.summary.intentional_rdb_investments
        ? {
            intentional_rdb_investments:
              data.summary.intentional_rdb_investments ?? intentionalRdb,
          }
        : {}),
    };
  }

  return {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    classified_expenses: classifiedExpenses,
    uncategorized_expenses: uncategorizedExpenses,
    net,
    investment: net,
    investment_pct: totalIncome > 0 ? roundPct((net / totalIncome) * 100) : 0,
    investment_desired: roundMoney(totalIncome * 0.45),
    ...(intentionalRdb ? { intentional_rdb_investments: intentionalRdb } : {}),
  };
}

export function getBudgetBuckets(data: BudgetData): BudgetBuckets {
  const rawBuckets = data.budget_buckets;
  if (!rawBuckets) {
    return DEFAULT_BUCKETS;
  }

  if (Array.isArray(rawBuckets)) {
    const mapped: BudgetBuckets = {
      custos_fixos: { ...DEFAULT_BUCKETS.custos_fixos },
      conforto: { ...DEFAULT_BUCKETS.conforto },
      liberdade_financeira: { ...DEFAULT_BUCKETS.liberdade_financeira },
    };

    for (const bucket of rawBuckets as any[]) {
      const key = String(bucket?.name ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]+/g, "_")
        .replace(/^_+|_+$/g, "");

      if (key in mapped) {
        mapped[key as keyof BudgetBuckets] = {
          ...mapped[key as keyof BudgetBuckets],
          target_pct: bucket?.target_pct ?? mapped[key as keyof BudgetBuckets].target_pct,
          categories: bucket?.categories ?? mapped[key as keyof BudgetBuckets].categories,
          actual_amount:
            bucket?.actual_amount ?? mapped[key as keyof BudgetBuckets].actual_amount,
          actual_pct: bucket?.actual_pct ?? mapped[key as keyof BudgetBuckets].actual_pct,
          delta_pp: bucket?.delta_pp ?? mapped[key as keyof BudgetBuckets].delta_pp,
        };
      }
    }

    return mapped;
  }

  return {
    custos_fixos: { ...DEFAULT_BUCKETS.custos_fixos, ...rawBuckets.custos_fixos },
    conforto: { ...DEFAULT_BUCKETS.conforto, ...rawBuckets.conforto },
    liberdade_financeira: {
      ...DEFAULT_BUCKETS.liberdade_financeira,
      ...rawBuckets.liberdade_financeira,
    },
  };
}

export interface MonthlyTotal {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export function getMonthlyTotals(months: BudgetData[]): MonthlyTotal[] {
  return months
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      const summary = getBudgetSummary(m);
      return {
        month: m.month,
        income: summary.total_income,
        expenses: summary.total_expenses,
        net: summary.net,
      };
    });
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

  const totalSpent = getBudgetSummary(data).total_expenses;
  const dailyAvg = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const projectedTotal = dailyAvg * daysInMonth;
  const previousMonthTotal = previousMonth
    ? getBudgetSummary(previousMonth).total_expenses
    : null;
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
  const summary = getBudgetSummary(data);
  const income = summary.total_income;
  const cats = data.expenses.by_category;

  const sumCats = (names: string[]) =>
    Math.round(names.reduce((s, c) => s + (cats[c]?.total || 0), 0) * 100) / 100;

  const rawBuckets = getBudgetBuckets(data);
  const buckets = [
    { name: "Custos Fixos", key: "custos_fixos", data: rawBuckets.custos_fixos },
    { name: "Conforto", key: "conforto", data: rawBuckets.conforto },
    {
      name: "Liberdade Financeira",
      key: "liberdade_financeira",
      data: rawBuckets.liberdade_financeira,
    },
  ];

  return buckets.map((b) => {
    const categories = b.data?.categories ?? [];
    const targetPct = b.data?.target_pct ?? 0;
    const actualAmount = sumCats(categories);
    const actualPct =
      income > 0 ? Math.round((actualAmount / income) * 10000) / 100 : 0;
    const targetAmount = Math.round(income * targetPct) / 100;

    return {
      name: b.name,
      key: b.key,
      targetPct,
      actualPct,
      actualAmount,
      targetAmount,
      delta: Math.round((actualPct - targetPct) * 100) / 100,
      categories,
    };
  });
}
