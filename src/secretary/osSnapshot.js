import { generateSecretaryBrief } from "./brief.js";

/**
 * Recursively sanitize all strings and values in snapshot data to ensure
 * zero secret credential leaks and zero raw financial numbers in worker context.
 */
function redactValue(val) {
  if (typeof val === "string") {
    return val
      .replace(/sk-[a-zA-Z0-9_\-]{8,}/g, "sk-***")
      .replace(/(?:key|token|password|secret|authorization)=[^&\s]+/gi, (m) => {
        const eqIdx = m.indexOf("=");
        if (eqIdx !== -1) {
          return `${m.slice(0, eqIdx)}=***`;
        }
        return "***";
      });
  }
  if (Array.isArray(val)) {
    return val.map(redactValue);
  }
  if (val && typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      // Withhold raw financial figures
      if (k === "spentCny" || k === "spent" || k === "balance" || k === "balanceCny" || k === "rawSpent") {
        continue;
      }
      res[k] = redactValue(v);
    }
    return res;
  }
  return val;
}

/**
 * Returns a complete, privacy-sanitized deterministic OS snapshot.
 * Safe for REST API consumption, control center dashboards, and external read models.
 */
export function getSecretaryOsSnapshot(config = {}, options = {}) {
  const brief = generateSecretaryBrief(config, options);

  const candidates = brief.memoryCandidates || (brief.founderDecisionsRequired?.items || [])
    .filter((d) => d.type === "memory_candidate")
    .map((d) => ({
      id: d.id,
      title: d.summary || "",
      text: d.summary || "",
      summary: d.summary || ""
    }));

  const snapshot = {
    ok: true,
    timestamp: brief.generatedAt,
    generatedAt: brief.generatedAt,
    activeTasks: brief.runningTasks || [],
    runningTasks: brief.runningTasks || [],
    recentCompletedTasks: brief.recentCompletedTasks || [],
    recentFailedTasks: brief.recentFailedTasks || [],
    pendingApprovals: brief.pendingApprovals || { count: 0, items: [] },
    workerHealth: brief.workerStatus || [],
    workerStatus: brief.workerStatus || [],
    deliverables: brief.recentDeliverables || [],
    recentDeliverables: brief.recentDeliverables || [],
    latestReports: brief.latestReports || [],
    memoryCandidates: candidates,
    founderDecisionsRequired: brief.founderDecisionsRequired || { totalPending: 0, items: [] },
    systemExceptions: brief.systemExceptions || [],
    billing: brief.billing
      ? {
          period: brief.billing.period || null,
          currency: brief.billing.currency || "CNY",
          hardStop: !!brief.billing.hardStop,
          alertsCount: brief.billing.alertsCount || 0,
          amounts: "withheld"
        }
      : null,
    desktopGrokBot: brief.desktopGrokBot || null,
    deliveryOutbox: brief.deliveryOutbox || []
  };

  return redactValue(snapshot);
}

/**
 * Formats a compact, deterministic text block for LLM prompt injection.
 * Consumes 0 external LLM tokens and operates with pure JS deterministic logic.
 */
export function buildOsSnapshotText(snapshot) {
  if (!snapshot) {
    return [
      "=== OS SNAPSHOT ===",
      "（本轮未注入快照）",
      "=== END OS SNAPSHOT ==="
    ].join("\n");
  }

  let data = snapshot;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      const sanitized = redactValue(String(snapshot)).trim();
      return [
        "=== OS SNAPSHOT ===",
        sanitized || "（快照不可用）",
        "=== END OS SNAPSHOT ==="
      ].join("\n");
    }
  }

  const sanitizedData = redactValue(data);

  const compact = {
    running: (sanitizedData.activeTasks || sanitizedData.runningTasks || []).map(
      (t) => `${t.status}:${t.id}:${t.title}`
    ),
    completed: (sanitizedData.recentCompletedTasks || []).slice(0, 5).map((t) => t.title),
    failed: (sanitizedData.recentFailedTasks || []).slice(0, 5).map(
      (t) => `${t.title} :: ${t.error || ""}`
    ),
    approvals: (sanitizedData.pendingApprovals?.items || []).slice(0, 8).map(
      (i) => `${i.approvalType || "task"}:${i.id}:${i.title}`
    ),
    decisions: (sanitizedData.founderDecisionsRequired?.items || []).slice(0, 8).map(
      (d) => d.summary
    ),
    candidates: (sanitizedData.memoryCandidates || []).slice(0, 5).map(
      (c) => `${c.id}:${c.title || c.text || c.summary}`
    ),
    workers: (sanitizedData.workerHealth || sanitizedData.workerStatus || []).map(
      (w) => `${w.id}:${w.status}:${w.available ? "up" : "down"}`
    ),
    billing: sanitizedData.billing ? "budget status available (amounts withheld)" : null,
    files: (sanitizedData.deliverables || sanitizedData.recentDeliverables || []).slice(0, 5).map(
      (f) => f.name || f.path
    ),
    reports: (sanitizedData.latestReports || []).slice(0, 5).map(
      (r) => `${r.name}:${r.ok === true ? "ok" : r.ok === false ? "fail" : r.kind || "meta"}`
    ),
    desktopBot: sanitizedData.desktopGrokBot
      ? `installed=${sanitizedData.desktopGrokBot.installed} running=${sanitizedData.desktopGrokBot.running}`
      : null
  };

  const json = JSON.stringify(compact);
  const truncated = json.length > 3500 ? `${json.slice(0, 3500)}…` : json;

  return [
    "=== OS SNAPSHOT ===",
    truncated,
    "=== END OS SNAPSHOT ==="
  ].join("\n");
}

// Aliases for compatibility
export const getOsSnapshot = getSecretaryOsSnapshot;

export function getCompactOsSnapshot(config = {}, options = {}) {
  const snapshot = getSecretaryOsSnapshot(config, { skipWorkerProbe: true, ...options });
  return buildOsSnapshotText(snapshot);
}
