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

type InvestmentRow = Record<string, unknown>;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function collectInvestments(baseDir: string, household?: string): InvestmentRow[] {
  const rows: InvestmentRow[] = [];

  function scanMonthDirs(dir: string, hName?: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !MONTH_RE.test(entry.name)) continue;

      const resultDir = path.join(dir, entry.name, "investments", "result");
      if (!fs.existsSync(resultDir)) continue;

      const jsonFiles = fs
        .readdirSync(resultDir)
        .filter((f) => f.startsWith("personal_finances_") && f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const parsed = readJsonFile(path.join(resultDir, file));
          if (Array.isArray(parsed)) {
            for (const row of parsed as InvestmentRow[]) {
              rows.push({
                ...row,
                month_year: row.month_year ?? entry.name,
                ...(hName ? { household: hName } : {}),
              });
            }
          }
        } catch {
          // skip malformed
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

  return rows;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resourcesDir = getResourcesDir();
  const household =
    typeof req.query.household === "string" ? req.query.household : undefined;

  try {
    const rows = collectInvestments(resourcesDir, household);
    rows.sort((a, b) =>
      String(a.month_year ?? "").localeCompare(String(b.month_year ?? ""))
    );
    res.status(200).json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to read resources directory" });
  }
}
