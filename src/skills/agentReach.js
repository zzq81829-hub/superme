import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SKILL_FILE = path.join(root, ".agents", "skills", "agent-reach", "SKILL.md");
const DEFAULT_COMMAND = path.join(
  os.homedir(),
  ".agent-reach-venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "agent-reach.exe" : "agent-reach"
);

const INTERNET_TASK = /https?:\/\/|全网|互联网|网页|搜索|调研|研究|热点|趋势|竞品|小红书|xiaohongshu|\bxhs\b|twitter|推特|\bX\b|reddit|facebook|instagram|youtube|bilibili|B站|v2ex|linkedin|领英|github|小宇宙|雪球|\brss\b|\bweb\b|\bresearch\b/i;

export function shouldUseAgentReach(task = {}) {
  return INTERNET_TASK.test(`${task.title || ""}\n${task.description || ""}`);
}

export function readAgentReachDirective(task = {}, options = {}) {
  if (!shouldUseAgentReach(task)) return "";
  const skillFile = options.skillFile || process.env.AGENT_REACH_SKILL_FILE || DEFAULT_SKILL_FILE;
  if (!fs.existsSync(skillFile)) return "";
  try {
    let text = fs.readFileSync(skillFile, "utf8").replace(/\r\n/g, "\n").trim();
    text = text.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (!text) return "";
    const command = options.command || process.env.AGENT_REACH_COMMAND || DEFAULT_COMMAND;
    return [
      "MANDATORY SKILL (Agent Reach / 互联网只读能力层):",
      `Agent Reach CLI: ${command}`,
      `Agent Reach tool bin: ${path.dirname(command)} (use exact executables from here if agent-reach or yt-dlp is not on PATH).`,
      "Use Agent Reach only to fetch/read/search. Never post, comment, like, upload, log in, or read browser cookies; all external writes remain behind Control Center approval.",
      text
    ].join("\n");
  } catch {
    return "";
  }
}
