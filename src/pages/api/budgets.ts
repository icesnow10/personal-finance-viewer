import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

function getResourcesDir(): string {
  const configFile = path.join(process.cwd(), ".config.json");
  try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (config.resourcesPath) return config.resourcesPath;
  } catch {
    // no config yet
  }
  return path.join(process.cwd(), "resources");
}

const MONTH_RE = /^\d{4}-\d{2}$/;

const DEFAULT_BUCKETS = {
  custos_fixos: {
    target_pct: 30,
    categories: ["Housing", "Health", "Insurance", "Groceries", "Transportation"],
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
  },
  liberdade_financeira: {
    target_pct: 45,
    categories: ["Investment (Troco Turbo)", "Net"],
  },
} as const;

type JsonRecord = Record<string, any>;
type BudgetFileMeta = {
  month: string;
  household?: string;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function normalizeBucketKey(value: unknown): string | null {
  if (!value) return null;
  const key = String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (key.includes("custos") || key.includes("fixos")) return "custos_fixos";
  if (key.includes("conforto")) return "conforto";
  if (key.includes("liberdade")) return "liberdade_financeira";
  return null;
}

function inferBucketFromCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  for (const [bucket, config] of Object.entries(DEFAULT_BUCKETS)) {
    if ((config.categories as readonly string[]).includes(category)) return bucket;
  }
  return null;
}

function inferDataThrough(transactions: JsonRecord[]): string | undefined {
  const dated = transactions
    .map((tx) => (typeof tx.date === "string" ? tx.date : null))
    .filter((date): date is string => Boolean(date))
    .sort();

  return dated.length > 0 ? dated[dated.length - 1] : undefined;
}

function normalizeBudget(raw: unknown, meta: BudgetFileMeta): JsonRecord {
  const data: JsonRecord = Array.isArray(raw)
    ? {
        month: meta.month,
        currency: "BRL",
        transactions: raw,
      }
    : { ...(raw as JsonRecord) };

  if (!data.month) data.month = meta.month;
  if (!data.currency) data.currency = "BRL";
  if (meta.household && !data.household) data.household = meta.household;

  if (Array.isArray(data.transactions)) {
    const transactions: JsonRecord[] = data.transactions.map((tx: JsonRecord) => ({
      ...tx,
      amount: roundMoney(Number(tx.amount ?? 0)),
      bucket: normalizeBucketKey(tx.bucket) ?? inferBucketFromCategory(tx.category),
    }));

    if (data.partial === undefined) {
      data.partial = transactions.some((tx) => Boolean(tx.provisional));
    }
    if (!data.data_through) {
      data.data_through = inferDataThrough(
        transactions.filter((tx) => !tx.provisional || tx.date)
      );
    }

    const incomeItems: JsonRecord[] = [];
    const byCategory: Record<string, { total: number; subcategories: Record<string, { total: number; transactions: JsonRecord[] }> }> = {};
    const unclassified: JsonRecord[] = [];
    const skipped: JsonRecord[] = [];
    const bucketCategories = {
      custos_fixos: new Set<string>(),
      conforto: new Set<string>(),
      liberdade_financeira: new Set<string>(),
    };

    for (const tx of transactions) {
      const baseTx = {
        id: tx.id,
        ...(tx.date ? { date: tx.date } : {}),
        description: tx.description,
        amount: tx.amount,
        source: tx.source,
        holder: tx.holder,
        bank: tx.bank,
        account_number: tx.account_number,
        bucket: tx.bucket ?? null,
        category: tx.category ?? null,
        subcategory: tx.subcategory ?? null,
        provisional: Boolean(tx.provisional),
      };

      if (tx.type === "income") {
        incomeItems.push(baseTx);
        continue;
      }

      if (tx.type === "skipped") {
        skipped.push(baseTx);
        continue;
      }

      if (tx.type === "unclassified" || !tx.category || !tx.subcategory) {
        unclassified.push({
          ...baseTx,
          guess: tx.subcategory ?? undefined,
        });
        continue;
      }

      if (!byCategory[tx.category]) {
        byCategory[tx.category] = { total: 0, subcategories: {} };
      }
      if (!byCategory[tx.category].subcategories[tx.subcategory]) {
        byCategory[tx.category].subcategories[tx.subcategory] = {
          total: 0,
          transactions: [],
        };
      }

      byCategory[tx.category].subcategories[tx.subcategory].transactions.push(baseTx);
      byCategory[tx.category].subcategories[tx.subcategory].total = roundMoney(
        byCategory[tx.category].subcategories[tx.subcategory].total + tx.amount
      );
      byCategory[tx.category].total = roundMoney(byCategory[tx.category].total + tx.amount);

      const bucketKey = tx.bucket ?? inferBucketFromCategory(tx.category);
      if (bucketKey && bucketKey in bucketCategories) {
        bucketCategories[bucketKey as keyof typeof bucketCategories].add(tx.category);
      }
    }

    const incomeTotal = roundMoney(
      incomeItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
    );
    const classifiedTotal = roundMoney(
      Object.values(byCategory).reduce((sum, category) => sum + category.total, 0)
    );
    const uncategorizedTotal = roundMoney(
      unclassified.reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)
    );

    data.transactions = transactions;
    data.income = {
      total: data.income?.total ?? incomeTotal,
      items: incomeItems,
    };
    data.expenses = {
      total: classifiedTotal + uncategorizedTotal,
      classified_total: classifiedTotal,
      uncategorized_total: uncategorizedTotal,
      by_category: byCategory,
      unclassified,
    };
    data.skipped = skipped;

    data.budget_buckets = {
      custos_fixos: {
        target_pct: 30,
        categories:
          Array.from(bucketCategories.custos_fixos).sort() ||
          DEFAULT_BUCKETS.custos_fixos.categories,
        actual_amount: 0,
        actual_pct: 0,
        delta_pp: 0,
      },
      conforto: {
        target_pct: 25,
        categories:
          Array.from(bucketCategories.conforto).sort() ||
          DEFAULT_BUCKETS.conforto.categories,
        actual_amount: 0,
        actual_pct: 0,
        delta_pp: 0,
      },
      liberdade_financeira: {
        target_pct: 45,
        categories:
          Array.from(bucketCategories.liberdade_financeira).sort() ||
          DEFAULT_BUCKETS.liberdade_financeira.categories,
        actual_amount: 0,
        actual_pct: 0,
        delta_pp: 0,
      },
    };
  }

  const totalIncome =
    (data.income as { total?: number } | undefined)?.total ?? 0;

  if (!data.budget_buckets && data.buckets) {
    const rawBuckets = data.buckets as Record<string, Record<string, unknown>>;
    const result: Record<string, unknown> = {};
    for (const [normalizedKey, def] of Object.entries(DEFAULT_BUCKETS)) {
      const match = Object.entries(rawBuckets).find(
        ([k]) =>
          k
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z]+/g, "_")
            .replace(/^_+|_+$/g, "") === normalizedKey
      );
      const existing = match?.[1];
      const actualAmount = Number(existing?.total ?? 0);
      const actualPct =
        Number(existing?.pct_of_income ?? 0) ||
        (totalIncome > 0 ? Math.round((actualAmount / totalIncome) * 1000) / 10 : 0);
      const targetPct = Number(existing?.target_pct ?? def.target_pct);

      result[normalizedKey] = {
        target_pct: targetPct,
        categories: (existing?.categories as string[]) ?? def.categories,
        actual_amount: actualAmount,
        actual_pct: actualPct,
        delta_pp: Math.round((actualPct - targetPct) * 10) / 10,
      };
    }
    data.budget_buckets = result;
    delete data.buckets;
  }

  if (typeof data.notes === "string") {
    data.notes = [data.notes];
  }

  return data;
}

function collectBudgets(baseDir: string, household?: string): Record<string, unknown>[] {
  const months: Record<string, unknown>[] = [];

  function scanMonthDirs(dir: string, hName?: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !MONTH_RE.test(entry.name)) continue;

      const resultDir = path.join(dir, entry.name, "expenses", "result");
      if (!fs.existsSync(resultDir)) continue;

      const jsonFiles = fs.readdirSync(resultDir).filter((f) => f.endsWith(".json"));
      for (const file of jsonFiles) {
        try {
          const parsed = readJsonFile(path.join(resultDir, file));
          const normalized = normalizeBudget(parsed, { month: entry.name, household: hName });
          if (normalized.month && (normalized.transactions || (normalized.expenses && normalized.income))) {
            months.push(normalized);
          }
        } catch {
          // skip malformed files
        }
      }
    }
  }

  const entries = fs.existsSync(baseDir)
    ? fs.readdirSync(baseDir, { withFileTypes: true })
    : [];

  const hasMonthDirs = entries.some((e) => e.isDirectory() && MONTH_RE.test(e.name));

  if (hasMonthDirs) {
    scanMonthDirs(baseDir);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || MONTH_RE.test(entry.name)) continue;
    const subDir = path.join(baseDir, entry.name);
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
    if (subEntries.some((e) => e.isDirectory() && MONTH_RE.test(e.name))) {
      if (!household || household === entry.name) {
        scanMonthDirs(subDir, entry.name);
      }
    }
  }

  return months;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resourcesDir = getResourcesDir();
  const household = typeof req.query.household === "string" ? req.query.household : undefined;

  try {
    const months = collectBudgets(resourcesDir, household);
    months.sort((a: any, b: any) => (a.month as string).localeCompare(b.month as string));
    res.status(200).json(months);
  } catch {
    return res.status(500).json({ error: "Failed to read resources directory" });
  }
}
