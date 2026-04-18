import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".config.json");

export function readResourcesPath(): string {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return typeof config.resourcesPath === "string" ? config.resourcesPath : "";
  } catch {
    return "";
  }
}

export function parentOfResources(p: string): string | null {
  const match = p.match(/^(.*?)[\\\/]resources(?:[\\\/].*)?[\\\/]?$/i);
  return match ? match[1] : null;
}

export type RunResult = { ok: true; cwd: string } | { ok: false; error: string };

export type RunOptions = {
  /** Close the PowerShell window as soon as claude exits. Use for scheduled/automated runs. */
  autoClose?: boolean;
};

export function runShortcut(prompt: string, opts: RunOptions = {}): RunResult {
  if (process.platform !== "win32") {
    return { ok: false, error: "Only Windows is supported" };
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, error: "prompt is required" };
  }

  const resourcesPath = readResourcesPath();
  if (!resourcesPath) {
    return { ok: false, error: "resourcesPath is not configured in /settings" };
  }

  const cwd = parentOfResources(resourcesPath);
  if (!cwd) {
    return {
      ok: false,
      error: `Could not derive parent of "resources" from: ${resourcesPath}`,
    };
  }
  if (!fs.existsSync(cwd)) {
    return { ok: false, error: `Working directory does not exist: ${cwd}` };
  }

  const escapedCwd = cwd.replace(/`/g, "``").replace(/"/g, '`"');
  const escapedPrompt = prompt.replace(/`/g, "``").replace(/"/g, '`"');
  // -p (print mode) is non-interactive: runs the prompt once, prints the result, exits.
  // --verbose streams tool calls and text in real time so the user can watch it work.
  // Without -p claude stays in interactive TUI so the user can keep chatting.
  const claudeCmd = opts.autoClose
    ? `claude -p "${escapedPrompt}" --verbose`
    : `claude "${escapedPrompt}"`;
  const ps1 = [`Set-Location "${escapedCwd}"`, claudeCmd, ""].join("\r\n");

  const scriptPath = path.join(
    os.tmpdir(),
    `claude-shortcut-${crypto.randomBytes(6).toString("hex")}.ps1`
  );
  // UTF-8 BOM so Windows PowerShell 5.1 reads the file as UTF-8 rather than ANSI (cp1252).
  fs.writeFileSync(scriptPath, "\ufeff" + ps1, { encoding: "utf8" });

  const psArgs = [
    "/c",
    "start",
    "",
    "powershell.exe",
    ...(opts.autoClose ? [] : ["-NoExit"]),
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ];

  const child = spawn("cmd.exe", psArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", () => {});
  child.unref();

  return { ok: true, cwd };
}
