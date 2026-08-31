import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { resolveAgentCommand } from "../../adapters/resolveCommand.js";

export function buildHermesLaunchSpec(config = {}) {
  if (process.platform !== "win32") {
    throw new Error("The visible Hermes launcher is currently available on Windows only.");
  }

  const hermesCommand = resolveAgentCommand(
    "hermes",
    config?.agents?.hermes?.command || "hermes"
  );

  const cwd = config.workspaceRoot || process.cwd();
  const installRoot = path.resolve(path.dirname(hermesCommand), "..");
  const desktopCommand = path.join(installRoot, "apps", "desktop", "release", "win-unpacked", "Hermes.exe");
  if (!fs.existsSync(desktopCommand)) {
    throw new Error("Hermes Desktop is not built. Run: hermes desktop --build-only");
  }

  return {
    launcher: desktopCommand,
    args: [],
    cwd,
    hermesCommand,
    env: { ...process.env, HERMES_DESKTOP_CWD: path.resolve(cwd) },
    interface: "desktop-client"
  };
}

export function openHermesUI(config = {}, { spawnImpl = spawn } = {}) {
  const spec = buildHermesLaunchSpec(config);
  const child = spawnImpl(spec.launcher, spec.args, {
    cwd: spec.cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: spec.env,
    shell: false
  });

  if (child.error) {
    throw child.error;
  }
  child.unref?.();

  return {
    ok: true,
    pid: child.pid || null,
    interface: spec.interface,
    hermesCommand: spec.hermesCommand
  };
}
