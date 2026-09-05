import fs from "fs";
import os from "os";
import path from "path";

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isNativeClaudeCandidate(filePath) {
  if (isFile(filePath)) return true;
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    // Windows application-control can hide a known installed binary with EPERM.
    return process.platform === "win32" && error.code === "EPERM";
  }
}

function pathCandidates(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extSource = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT")
    : "";
  const exts = process.platform === "win32"
    ? extSource.split(";").filter(Boolean)
    : [""];
  const names = process.platform === "win32" && !path.extname(name)
    ? [...new Set(exts.flatMap((ext) => [name + ext, name + ext.toLowerCase()]))]
    : [name];

  const out = [];
  for (const dir of dirs) {
    for (const candidateName of names) {
      out.push(path.join(dir, candidateName));
    }
  }
  return out;
}

function newestCodexBinary() {
  const binRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "OpenAI", "Codex", "bin");
  if (!fs.existsSync(binRoot)) return null;

  const found = [];
  for (const entry of fs.readdirSync(binRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const exe = path.join(binRoot, entry.name, "codex.exe");
    if (isFile(exe)) found.push(exe);
  }
  found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0] || null;
}

function knownLocations(agentName) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  if (agentName === "codex") {
    return [newestCodexBinary(), path.join(localAppData, "OpenAI", "Codex", "codex.exe")].filter(Boolean);
  }
  if (agentName === "antigravity") {
    return [path.join(localAppData, "agy", "bin", "agy.exe")];
  }
  if (agentName === "hermes") {
    return [path.join(localAppData, "hermes", "hermes-agent", "bin", "hermes.exe")];
  }
  if (agentName === "claude") {
    const npmRoot = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "npm");
    return [
      path.join(npmRoot, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
      path.join(npmRoot, "claude.exe"),
      path.join(npmRoot, "claude.cmd")
    ];
  }
  if (agentName === "grok" || agentName === "grok-build") {
    return [path.join(os.homedir(), ".grok", "bin", "grok.exe")];
  }
  return [];
}

export function resolveAgentCommand(agentName, configured = "") {
  if (configured && path.isAbsolute(configured) && isFile(configured)) {
    return configured;
  }

  // The npm shim is a .cmd file and would require a shell. Prefer Claude's
  // native executable so an untrusted task prompt is never parsed by cmd.exe.
  if (agentName === "claude" && configured && !path.extname(configured)) {
    for (const candidate of knownLocations(agentName)) {
      if (/\.exe$/i.test(candidate) && isNativeClaudeCandidate(candidate)) return candidate;
    }
  }

  if (configured) {
    for (const candidate of pathCandidates(configured)) {
      if (isFile(candidate)) return candidate;
    }
  }

  for (const candidate of knownLocations(agentName)) {
    if (isFile(candidate)) return candidate;
  }

  return configured || agentName;
}

export function pathWithCommandDir(command, env = process.env) {
  const next = { ...env };
  if (command && path.isAbsolute(command)) {
    next.PATH = `${path.dirname(command)}${path.delimiter}${env.PATH || ""}`;
  }
  return next;
}
