import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { recordEvent, listEvents, getEvent } from "../learning/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultEventsDir = path.resolve(__dirname, "../../data/events");

export const CANONICAL_EVENT_TYPES = Object.freeze([
  "task_started",
  "task_completed",
  "task_failed",
  "test_passed",
  "test_failed",
  "content_published",
  "content_24h_metrics",
  "content_72h_metrics",
  "sale_created",
  "agent_timeout",
  "user_rejected",
  "user_approved",
  "policy_changed",
  "reflection_completed",
  "task_verified",
  "task_dispatched",
  "goal_created",
  "plan_generated"
]);

const subscribers = new Set();

export function getEventsDir(options = {}) {
  const dir = options.eventsDir || process.env.UNIVERSAL_EVENTS_DIR || defaultEventsDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function subscribeToEvents(handler) {
  if (typeof handler === "function") {
    subscribers.add(handler);
    return () => subscribers.delete(handler);
  }
  return () => {};
}

export function publishEvent(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Event input must be an object");
  }

  const type = String(input.type || "").trim();
  if (!type) {
    throw new Error("Event 'type' is required");
  }

  const timestamp = input.timestamp || input.at || new Date().toISOString();
  const eventId = input.id || `evt-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const projectId = input.project_id || input.projectId || input.domain || "general";
  const taskId = input.task_id || input.taskId || input.subject?.id || null;
  const source = input.source || input.actor || "system";
  const outcome = input.outcome || (input.type.includes("failed") ? "failure" : input.type.includes("completed") || input.type.includes("passed") ? "success" : "info");

  const normalizedEvent = {
    id: eventId,
    type,
    project_id: projectId,
    task_id: taskId,
    source,
    outcome,
    metrics: typeof input.metrics === "object" && input.metrics !== null ? input.metrics : {},
    payload: typeof input.payload === "object" && input.payload !== null ? input.payload : {},
    timestamp,
    at: timestamp,
    actor: source,
    domain: projectId
  };

  // 1. Write to universal events store
  const dir = getEventsDir(options);
  const eventFile = path.join(dir, `${eventId}.json`);
  const tmpFile = path.join(dir, `${eventId}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(normalizedEvent, null, 2), "utf8");
  fs.renameSync(tmpFile, eventFile);

  // 2. Interoperate with learning events ledger if applicable
  try {
    const learningTypeMap = {
      user_approved: "FOUNDER_APPROVED",
      user_rejected: "FOUNDER_REJECTED",
      task_completed: "TASK_SUCCEEDED",
      task_failed: "TASK_FAILED",
      content_24h_metrics: "CONTENT_OUTPERFORMED",
      policy_changed: "AGENT_ESCALATED"
    };
    const mappedType = learningTypeMap[type];
    if (mappedType) {
      recordEvent({
        id: `lrn-${eventId}`,
        type: mappedType,
        domain: projectId,
        at: timestamp,
        actor: source,
        subject: { kind: "task", id: taskId },
        payload: normalizedEvent
      }, options);
    }
  } catch {
    // Non-fatal if learning ledger has separate constraint
  }

  // 3. Notify in-process subscribers
  for (const sub of subscribers) {
    try {
      sub(normalizedEvent);
    } catch {
      // subscriber errors do not break publish
    }
  }

  return normalizedEvent;
}

export function queryEvents(filter = {}, options = {}) {
  const dir = getEventsDir(options);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes(".tmp"));
  const events = [];

  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      events.push(parsed);
    } catch {
      // ignore malformed files
    }
  }

  // Sort descending by timestamp
  events.sort((a, b) => String(b.timestamp || b.at || "").localeCompare(String(a.timestamp || a.at || "")));

  return events.filter(e => {
    if (filter.type && e.type !== filter.type) return false;
    if (filter.project_id && e.project_id !== filter.project_id && e.domain !== filter.project_id) return false;
    if (filter.task_id && e.task_id !== filter.task_id) return false;
    if (filter.source && e.source !== filter.source && e.actor !== filter.source) return false;
    if (filter.outcome && e.outcome !== filter.outcome) return false;
    if (filter.since && new Date(e.timestamp) < new Date(filter.since)) return false;
    return true;
  });
}

export function getEventStats(options = {}) {
  const events = queryEvents({}, options);
  const stats = {
    total: events.length,
    byType: {},
    byOutcome: {},
    bySource: {}
  };

  for (const e of events) {
    stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    stats.byOutcome[e.outcome] = (stats.byOutcome[e.outcome] || 0) + 1;
    stats.bySource[e.source] = (stats.bySource[e.source] || 0) + 1;
  }

  return stats;
}
