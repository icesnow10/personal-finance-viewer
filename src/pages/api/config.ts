import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".config.json");

function readConfig(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, string>) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(readConfig());
  }

  if (req.method === "PUT") {
    const { resourcesPath } = req.body;
    if (typeof resourcesPath !== "string") {
      return res.status(400).json({ error: "resourcesPath must be a string" });
    }

    // Validate the path exists
    if (resourcesPath && !fs.existsSync(resourcesPath)) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    const config = readConfig();
    config.resourcesPath = resourcesPath;
    writeConfig(config);
    return res.status(200).json(config);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
