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
  const desktopCommand = findDesktopCommand(hermesCommand);
  if (!desktopCommand) {
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

// The `hermes` command may resolve to a venv shim (venv/Scripts/hermes.EXE) or
// a bin shim (bin/hermes.exe). Walk upward from its directory until we find the
// install root that contains the packaged desktop app.
function findDesktopCommand(hermesCommand) {
  let dir = path.dirname(hermesCommand);
  for (let i = 0; i < 8; i++) {
    const candidates = [
      path.join(dir, "apps", "desktop", "release", "win-unpacked", "Hermes.exe"),
      path.join(dir, "hermes-agent", "apps", "desktop", "release", "win-unpacked", "Hermes.exe")
    ];
    const candidate = candidates.find((item) => fs.existsSync(item));
    if (candidate) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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
