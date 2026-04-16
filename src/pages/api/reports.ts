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

type ReportEntry = {
  month: string;
  household?: string;
  filename: string;
  title: string;
  content: string;
};

function prettyTitle(filename: string): string {
  const base = filename.replace(/\.md$/i, "");
  if (base === "missing_information") return "Missing Information";
  if (/^attribution_detailed_/.test(base)) return "Attribution (Detailed)";
  if (/^attribution_/.test(base)) return "Attribution";
  return base
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectReports(baseDir: string, household?: string): ReportEntry[] {
  const out: ReportEntry[] = [];

  function scanMonthDirs(dir: string, hName?: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !MONTH_RE.test(entry.name)) continue;
      const resultDir = path.join(dir, entry.name, "investments", "result");
      if (!fs.existsSync(resultDir)) continue;
      const mdFiles = fs.readdirSync(resultDir).filter((f) => f.toLowerCase().endsWith(".md"));
      for (const file of mdFiles) {
        try {
          const content = fs.readFileSync(path.join(resultDir, file), "utf8").replace(/^\uFEFF/, "");
          out.push({
            month: entry.name,
            household: hName,
            filename: file,
            title: prettyTitle(file),
            content,
          });
        } catch {
          // skip
        }
      }
    }
  }

  const entries = fs.existsSync(baseDir) ? fs.readdirSync(baseDir, { withFileTypes: true }) : [];
  const hasMonthDirs = entries.some((e) => e.isDirectory() && MONTH_RE.test(e.name));
  if (hasMonthDirs) scanMonthDirs(baseDir);

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

  return out;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resourcesDir = getResourcesDir();
  const household = typeof req.query.household === "string" ? req.query.household : undefined;

  try {
    const reports = collectReports(resourcesDir, household);
    reports.sort((a, b) => (a.month === b.month ? a.filename.localeCompare(b.filename) : b.month.localeCompare(a.month)));
    res.status(200).json(reports);
  } catch {
    return res.status(500).json({ error: "Failed to read resources directory" });
  }
}
