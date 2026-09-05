import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, "../../data/learning/events");

export const EVENT_TYPES = Object.freeze([
  "FOUNDER_SELECTED",
  "FOUNDER_APPROVED",
  "FOUNDER_REJECTED",
  "FOUNDER_EDITED",
  "FOUNDER_REGENERATED",
  "FOUNDER_FAVORITED",
  "TASK_SUCCEEDED",
  "TASK_FAILED",
  "CONTENT_OUTPERFORMED",
  "CONTENT_UNDERPERFORMED",
  "AGENT_ESCALATED",
  "LEARNING_CONFLICT"
]);

export function getEventsDir(options = {}) {
  const dir = options.eventsDir || options.baseDir || process.env.LEARNING_EVENTS_DIR || defaultDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function recordEvent(input = {}, options = {}) {
  const type = EVENT_TYPES.includes(input.type) ? input.type : null;
  if (!type) throw new Error("Invalid learning event type");

  const event = {
    id: input.id || `evt-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    type,
    domain: input.domain || "general",
    at: input.at || new Date().toISOString(),
    actor: input.actor || "system",
    subject: input.subject || { kind: "unknown", id: null },
    winner: input.winner || null,
    losers: Array.isArray(input.losers) ? input.losers : [],
    explicitFeedback: input.explicitFeedback || null,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    processed: false
  };

  const dir = getEventsDir(options);
  const file = path.join(dir, `${event.id}.json`);
  if (fs.existsSync(file)) {
    throw new Error(`Event ${event.id} already exists (append-only ledger violation)`);
  }
  const tmpFile = path.join(dir, `${event.id}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(event, null, 2), "utf8");
  fs.renameSync(tmpFile, file);
  return event;
}

export function getEvent(id, options = {}) {
  const file = path.join(getEventsDir(options), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function listEvents(filter = {}, options = {}) {
  const dir = getEventsDir(options);
  if (!fs.existsSync(dir)) return [];
  const events = fs.readdirSync(dir)
    .filter((n) => n.endsWith(".json") && !n.includes(".tmp"))
    .map((n) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  return events.filter((e) => {
    if (filter.type && e.type !== filter.type) return false;
    if (filter.domain && e.domain !== filter.domain) return false;
    if (filter.subjectId && e.subject?.id !== filter.subjectId) return false;
    if (filter.actor && e.actor !== filter.actor) return false;
    return true;
  });
}

export function markProcessed(id, options = {}) {
  const dir = getEventsDir(options);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const event = JSON.parse(fs.readFileSync(file, "utf8"));
  event.processed = true;
  const tmpFile = path.join(dir, `${id}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(event, null, 2), "utf8");
  fs.renameSync(tmpFile, file);
  return event;
}
