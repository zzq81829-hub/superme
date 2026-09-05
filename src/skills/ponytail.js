import fs from "fs";
import os from "os";
import path from "path";

// The founder requires EVERY worker to operate in "马尾辫 / ponytail" mode (the
// laziest solution that actually works). The skill is installed in Codex's
// skills dir (~/.codex/skills/ponytail/SKILL.md); buildPrompt embeds its body
// into every dispatched task prompt so the directive is guaranteed for all
// workers, not left to model discretion.

const DEFAULT_PONYTAIL_SKILL = path.join(os.homedir(), ".codex", "skills", "ponytail", "SKILL.md");

export function getPonytailSkillPath(options = {}) {
  return options.skillFile || process.env.PONYTAIL_SKILL_FILE || DEFAULT_PONYTAIL_SKILL;
}

export function readPonytailDirective(options = {}) {
  const skillFile = getPonytailSkillPath(options);
  if (!fs.existsSync(skillFile)) return "";
  try {
    let text = fs.readFileSync(skillFile, "utf8").replace(/\r\n/g, "\n").trim();
    text = text.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (!text) return "";
    return [
      "",
      "MANDATORY SKILL (马尾辫 / ponytail):",
      "You MUST activate and strictly follow the ponytail skill for this entire task, no exceptions.",
      text
    ].join("\n");
  } catch {
    return "";
  }
}
