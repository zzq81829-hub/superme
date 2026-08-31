import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The Founder Brief is the shared Hermes consensus backup: the founder and
// Hermes settle requirements through grilling, then the latest founder-approved
// result is injected into every worker prompt by src/router.js::buildPrompt.

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

export function updateHermesBrief(content, options = {}) {
  const text = String(content ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("Hermes brief content cannot be empty");
  return updateBrief(text, options);
}
