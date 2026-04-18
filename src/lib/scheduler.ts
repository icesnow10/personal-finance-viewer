import fs from "fs";
import path from "path";
import crypto from "crypto";
import cron, { ScheduledTask } from "node-cron";
import { runShortcut } from "./runShortcut";

const SCHEDULES_FILE = path.join(process.cwd(), ".pfv-schedules.json");

export type Schedule = {
  id: string;
  label: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  lastRun?: number;
  lastResult?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __pfv_scheduler:
    | { schedules: Map<string, Schedule>; tasks: Map<string, ScheduledTask>; loaded: boolean }
    | undefined;
}

const store =
  globalThis.__pfv_scheduler ||
  (globalThis.__pfv_scheduler = {
    schedules: new Map<string, Schedule>(),
    tasks: new Map<string, ScheduledTask>(),
    loaded: false,
  });

function readFile(): Schedule[] {
  try {
    const raw = fs.readFileSync(SCHEDULES_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeFile() {
  const data = Array.from(store.schedules.values());
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2), "utf8");
}

function registerTask(schedule: Schedule) {
  unregisterTask(schedule.id);
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cron)) return;

  const task = cron.schedule(
    schedule.cron,
    () => {
      const result = runShortcut(schedule.prompt, { autoClose: true });
      const current = store.schedules.get(schedule.id);
      if (current) {
        current.lastRun = Date.now();
        current.lastResult = result.ok ? "ok" : `error: ${result.error}`;
        store.schedules.set(schedule.id, current);
        writeFile();
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  store.tasks.set(schedule.id, task);
}

function unregisterTask(id: string) {
  const existing = store.tasks.get(id);
  if (existing) {
    existing.stop();
    store.tasks.delete(id);
  }
}

function ensureLoaded() {
  if (store.loaded) return;
  const data = readFile();
  for (const s of data) {
    store.schedules.set(s.id, s);
    registerTask(s);
  }
  store.loaded = true;
}

export function listSchedules(): Schedule[] {
  ensureLoaded();
  return Array.from(store.schedules.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function createSchedule(input: Omit<Schedule, "id">): Schedule {
  ensureLoaded();
  const schedule: Schedule = { ...input, id: crypto.randomUUID() };
  store.schedules.set(schedule.id, schedule);
  registerTask(schedule);
  writeFile();
  return schedule;
}

export function updateSchedule(id: string, patch: Partial<Omit<Schedule, "id">>): Schedule | null {
  ensureLoaded();
  const existing = store.schedules.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id };
  store.schedules.set(id, updated);
  registerTask(updated);
  writeFile();
  return updated;
}

export function deleteSchedule(id: string): boolean {
  ensureLoaded();
  const existed = store.schedules.delete(id);
  unregisterTask(id);
  if (existed) writeFile();
  return existed;
}

export function runScheduleNow(id: string): { ok: boolean; error?: string } {
  ensureLoaded();
  const s = store.schedules.get(id);
  if (!s) return { ok: false, error: "not found" };
  const result = runShortcut(s.prompt, { autoClose: true });
  s.lastRun = Date.now();
  s.lastResult = result.ok ? "ok (manual)" : `error: ${result.error}`;
  store.schedules.set(id, s);
  writeFile();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// Trigger load on module import so cron jobs are active as soon as the server starts.
ensureLoaded();
