import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

// Serve the raw on-disk budget_*.json (the flat source array the plugin writes) for a given
// month, so the viewer can show the untouched source JSON. Mirrors the resource-dir + layout
// resolution used by /api/budgets (flat `<res>/<month>/...` and per-household `<res>/<h>/<month>/...`).

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

function findBudgetFile(baseDir: string, month: string, household?: string): string | null {
  const candidates: string[] = [];
  const push = (dir: string) => {
    const resultDir = path.join(dir, month, "expenses", "result");
    if (!fs.existsSync(resultDir)) return;
    for (const f of fs.readdirSync(resultDir)) {
      if (/^budget_.+\.json$/i.test(f)) candidates.push(path.join(resultDir, f));
    }
  };
  // Flat layout: <res>/<month>/...
  push(baseDir);
  // Per-household layout: <res>/<household>/<month>/...
  if (household) {
    push(path.join(baseDir, household));
  } else {
    for (const entry of fs.existsSync(baseDir) ? fs.readdirSync(baseDir, { withFileTypes: true }) : []) {
      if (entry.isDirectory() && !MONTH_RE.test(entry.name)) push(path.join(baseDir, entry.name));
    }
  }
  return candidates[0] ?? null;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const month = String(req.query.month ?? "");
  const household = req.query.household ? String(req.query.household) : undefined;
  if (!MONTH_RE.test(month)) {
    return res.status(400).json({ error: "Invalid or missing month (expected YYYY-MM)" });
  }
  const file = findBudgetFile(getResourcesDir(), month, household);
  if (!file) {
    return res.status(404).json({ error: `No budget source file found for ${month}` });
  }
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Source-File", path.basename(file));
  return res.status(200).send(raw);
}
