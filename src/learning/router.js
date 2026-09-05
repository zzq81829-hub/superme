import { recordEvent, markProcessed } from "./events.js";
import { addEvidence } from "../memory/store.js";

const POSITIVE = new Set(["FOUNDER_APPROVED", "FOUNDER_SELECTED", "FOUNDER_FAVORITED", "TASK_SUCCEEDED", "CONTENT_OUTPERFORMED"]);
const NEGATIVE = new Set(["FOUNDER_REJECTED", "FOUNDER_EDITED", "FOUNDER_REGENERATED", "TASK_FAILED", "CONTENT_UNDERPERFORMED"]);

export function emitLearningEvent(input = {}, options = {}) {
  const event = recordEvent(input, options);
  applyLearningEvent(event, options);
  return event;
}

export function applyLearningEvent(event, options = {}) {
  if (!event || event.processed) return event;

  const subject = event.subject || {};
  if (subject.kind === "memory" && subject.id) {
    const positive = POSITIVE.has(event.type);
    const negative = NEGATIVE.has(event.type);
    if (positive || negative) {
      try {
        addEvidence(subject.id, {
          positive,
          source: event.id,
          exampleRef: subject.id,
          note: event.explicitFeedback || event.type
        }, options);
      } catch {
        // Memory may not exist; event still stands.
      }
    }
  }

  try {
    markProcessed(event.id, options);
    event.processed = true;
  } catch {
    // Isolation tests may use a different events dir.
  }
  return event;
}
