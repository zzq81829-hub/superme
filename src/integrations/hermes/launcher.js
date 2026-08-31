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

  return {
    launcher: hermesCommand,
    args: ["desktop", "--skip-build", "--cwd", path.resolve(cwd)],
    cwd,
    hermesCommand,
    interface: "desktop-client"
  };
}

export function openHermesUI(config = {}, { spawnImpl = spawn } = {}) {
  const spec = buildHermesLaunchSpec(config);
  const child = spawnImpl(spec.launcher, spec.args, {
    cwd: spec.cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
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
