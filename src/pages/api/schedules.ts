import type { NextApiRequest, NextApiResponse } from "next";
import cron from "node-cron";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  runScheduleNow,
  updateSchedule,
} from "@/lib/scheduler";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ schedules: listSchedules() });
  }

  if (req.method === "POST") {
    const { label, prompt, cron: cronExpr, enabled } = req.body ?? {};
    if (typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "label is required" });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }
    if (typeof cronExpr !== "string" || !cron.validate(cronExpr)) {
      return res.status(400).json({ error: "invalid cron expression" });
    }
    const created = createSchedule({
      label: label.trim(),
      prompt: prompt.trim(),
      cron: cronExpr.trim(),
      enabled: enabled !== false,
    });
    return res.status(201).json(created);
  }

  if (req.method === "PUT") {
    const { id, ...patch } = req.body ?? {};
    if (typeof id !== "string") return res.status(400).json({ error: "id is required" });
    if (patch.cron && !cron.validate(patch.cron)) {
      return res.status(400).json({ error: "invalid cron expression" });
    }
    const updated = updateSchedule(id, patch);
    if (!updated) return res.status(404).json({ error: "not found" });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    const { id } = req.body ?? {};
    if (typeof id !== "string") return res.status(400).json({ error: "id is required" });
    const ok = deleteSchedule(id);
    return res.status(ok ? 200 : 404).json({ ok });
  }

  if (req.method === "PATCH") {
    // run-now
    const { id } = req.body ?? {};
    if (typeof id !== "string") return res.status(400).json({ error: "id is required" });
    const result = runScheduleNow(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
