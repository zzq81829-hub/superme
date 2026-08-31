import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolveAgentCommand } from "../adapters/resolveCommand.js";

/**
 * Probes the local environment for Grok Bot interface readiness.
 * Strict Constraint: canDispatch MUST ALWAYS be false.
 * 
 * Rules:
 * - Only read-only --help / version CLI probes. No real chats, no paid APIs.
 * - If only Grok Build TUI is found or no discrete non-interactive bot control socket exists:
 *   status is "UNKNOWN_CONTROL_INTERFACE", canSubmit=false, canDispatch=false.
 */
export function probeGrokBot() {
  const command = resolveAgentCommand("grok", "grok");
  const onDisk = existsSync(command);

  if (!onDisk) {
    return {
      status: "OFFLINE",
      available: false,
      canSubmit: false,
      canDispatch: false,
      evidence: "grok CLI binary not found on local PATH or standard installation directories",
      distinctFrom: ["grok", "grok-build"]
    };
  }

  // Probe grok CLI for non-interactive bot subcommands or discrete bot protocols
  try {
    const r = spawnSync(command, ["--help"], {
      encoding: "utf8",
      timeout: 10000,
      shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
    });

    const output = `${r.stdout || ""}\n${r.stderr || ""}`;
    const isGrokBuild = /Grok Build TUI/i.test(output);

    // If it's Grok Build TUI and does not have a dedicated non-interactive bot control daemon
    if (isGrokBuild) {
      return {
        status: "UNKNOWN_CONTROL_INTERFACE",
        available: false,
        canSubmit: false,
        canDispatch: false,
        evidence: "grok.exe found on PATH is 'Grok Build TUI' (shared by Grok and Grok Build); no discrete non-interactive Grok Bot control interface or protocol daemon detected",
        distinctFrom: ["grok", "grok-build"]
      };
    }
  } catch (err) {
    return {
      status: "UNKNOWN_CONTROL_INTERFACE",
      available: false,
      canSubmit: false,
      canDispatch: false,
      evidence: `Probe failed to execute ${command}: ${err.message}`,
      distinctFrom: ["grok", "grok-build"]
    };
  }

  return {
    status: "UNKNOWN_CONTROL_INTERFACE",
    available: false,
    canSubmit: false,
    canDispatch: false,
    evidence: "grok executable present but lacks verified non-interactive secretary bot submission interface",
    distinctFrom: ["grok", "grok-build"]
  };
}
