import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

const DEFAULT_EXE = "D:\\新建文件夹 (3)\\Grok Bot\\Grok Bot.exe";

export function desktopBotExePath(config = {}) {
  const configured = config.agents?.grokBot?.desktopPath;
  const candidates = [
    configured,
    DEFAULT_EXE,
    process.env.GROK_BOT_DESKTOP_EXE
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export function isDesktopBotRunning() {
  if (process.platform !== "win32") return false;
  const r = spawnSync("tasklist", ["/FI", "IMAGENAME eq Grok Bot.exe", "/FO", "CSV", "/NH"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000
  });
  return /Grok Bot\.exe/i.test(r.stdout || "");
}

export function probeDesktopBot(config = {}) {
  const exePath = desktopBotExePath(config);
  const installed = !!exePath;
  const running = installed && isDesktopBotRunning();
  return {
    product: "Grok Bot.exe",
    installed,
    running,
    path: exePath,
    inbound: "/api/secretary/grok-bot/inbound",
    snapshot: "/api/secretary/os-snapshot",
    canLaunch: installed,
    canSubmit: false,
    canDispatch: false,
    distinctFrom: ["grok", "grok-build", "grok -p chat"],
    evidence: installed
      ? `Desktop exe present at ${exePath}${running ? " (running)" : " (not running)"}; inbound HTTP on :3210, canDispatch=false`
      : "Grok Bot.exe not found on disk"
  };
}

export function openDesktopBot(config = {}, { spawnImpl = spawn } = {}) {
  const exePath = desktopBotExePath(config);
  if (!exePath) {
    throw new Error("Grok Bot.exe not found. Expected D:\\新建文件夹 (3)\\Grok Bot\\Grok Bot.exe");
  }
  const child = spawnImpl(exePath, [], {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  if (child.error) throw child.error;
  child.unref?.();
  return {
    ok: true,
    pid: child.pid || null,
    path: exePath,
    interface: "desktop-electron",
    canDispatch: false
  };
}
