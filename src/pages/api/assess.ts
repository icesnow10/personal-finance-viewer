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
const ASSESS_RE = /^assess_(\d{4}-\d{2})\.json$/;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
  return JSON.parse(raw);
}

// Collect every assess_{month}.json under the resources tree, mirroring the dir handling in
// /api/investments (baseDir may hold month dirs directly, or one level of household dirs).
function collectAssessments(baseDir: string, household?: string): unknown[] {
  const out: unknown[] = [];

  function scanMonthDirs(dir: string, hName?: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !MONTH_RE.test(entry.name)) continue;
      const resultDir = path.join(dir, entry.name, "investments", "result");
      if (!fs.existsSync(resultDir)) continue;
      for (const file of fs.readdirSync(resultDir)) {
        const m = file.match(ASSESS_RE);
        if (!m) continue;
        try {
          const parsed = readJsonFile(path.join(resultDir, file)) as Record<string, unknown>;
          if (parsed && typeof parsed === "object") {
            out.push({ ...parsed, month: parsed.month ?? m[1], ...(hName ? { household: hName } : {}) });
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  const entries = fs.existsSync(baseDir) ? fs.readdirSync(baseDir, { withFileTypes: true }) : [];
  if (entries.some((e) => e.isDirectory() && MONTH_RE.test(e.name))) scanMonthDirs(baseDir);
  for (const entry of entries) {
    if (!entry.isDirectory() || MONTH_RE.test(entry.name)) continue;
    const subDir = path.join(baseDir, entry.name);
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
    if (subEntries.some((e) => e.isDirectory() && MONTH_RE.test(e.name))) {
      if (!household || household === entry.name) scanMonthDirs(subDir, entry.name);
    }
  }
  return out;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const household = typeof req.query.household === "string" ? req.query.household : undefined;
  try {
    const rows = collectAssessments(getResourcesDir(), household);
    rows.sort((a, b) => String((a as Record<string, unknown>).month ?? "").localeCompare(String((b as Record<string, unknown>).month ?? "")));
    res.status(200).json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to read resources directory" });
  }
}
