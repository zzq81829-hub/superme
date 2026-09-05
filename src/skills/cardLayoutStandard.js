import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");

const DEFAULT_SKILL_PATH = path.join(root, ".agents", "skills", "card-layout-standard", "SKILL.md");

export function getCardLayoutStandardSkillPath(options = {}) {
  return options.skillFile || process.env.CARD_LAYOUT_SKILL_FILE || DEFAULT_SKILL_PATH;
}

export function readCardLayoutStandardDirective(options = {}) {
  const file = getCardLayoutStandardSkillPath(options);
  if (!fs.existsSync(file)) return "";
  try {
    let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
    text = text.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (!text) return "";
    return [
      "",
      "MANDATORY SKILL (card-layout-standard / 卡片排版与视觉装帧标准):",
      "When performing any card design, layout adjustment, visual rendering, or image typesetting tasks, you MUST strictly adhere to card-layout-standard:",
      text
    ].join("\n");
  } catch {
    return "";
  }
}
