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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resourcesDir = getResourcesDir();
  const months: Record<string, unknown>[] = [];

  try {
    if (!fs.existsSync(resourcesDir)) {
      return res.status(200).json([]);
    }

    const entries = fs.readdirSync(resourcesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d{4}-\d{2}$/.test(entry.name)) continue;

      const resultDir = path.join(resourcesDir, entry.name, "expenses", "result");
      if (!fs.existsSync(resultDir)) continue;

      const jsonFiles = fs.readdirSync(resultDir).filter((f) => f.endsWith(".json"));
      for (const file of jsonFiles) {
        try {
          const raw = fs.readFileSync(path.join(resultDir, file), "utf8");
          const data = JSON.parse(raw);
          if (data.month && data.expenses && data.income) {
            months.push(data);
          }
        } catch {
          // skip malformed files
        }
      }
    }
  } catch {
    return res.status(500).json({ error: "Failed to read resources directory" });
  }

  months.sort((a: any, b: any) => (a.month as string).localeCompare(b.month as string));
  res.status(200).json(months);
}
