import type { NextApiRequest, NextApiResponse } from "next";
import { runShortcut } from "@/lib/runShortcut";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body ?? {};
  const result = runShortcut(prompt);

  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(200).json({ ok: true, cwd: result.cwd });
}
