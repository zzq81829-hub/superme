import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The Founder Brief (需求简报) is a dedicated, human-editable markdown file that
// captures the founder's requirements, taste and standards. It is injected into
// every task prompt by src/router.js::buildPrompt so workers produce output
// adapted to the founder's needs. It sits alongside FOUNDER_MODEL.md and
// GOVERNANCE.md in founder_os/ on purpose: those files "read the founder's
// thinking", this one reads the founder's *requirements*.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");
const defaultBriefPath = path.join(root, "founder_os", "BRIEF.md");

export function getBriefPath(options = {}) {
  return options.briefPath || process.env.BRIEF_FILE || defaultBriefPath;
}

export function getBrief(options = {}) {
  const file = getBriefPath(options);
  let exists = fs.existsSync(file);
  let content = "";
  if (exists) {
    try {
      content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    } catch {
      content = "";
    }
  }

  let updatedAt = null;
  if (exists) {
    try {
      updatedAt = fs.statSync(file).mtime.toISOString();
    } catch {
      // Best-effort mtime; not worth failing the read over.
    }
  }

  return { path: file, content, updatedAt, exists };
}

export function updateBrief(content, options = {}) {
  const text = String(content ?? "").replace(/\r\n/g, "\n");
  const file = getBriefPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return getBrief(options);
}
