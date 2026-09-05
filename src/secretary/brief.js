import fs from "fs";
import path from "path";
import { listTasks } from "../store.js";
import { listCandidates } from "../memory/store.js";
import { workerHealthMap } from "../workers/health.js";
import { getWorkersRegistry } from "../workforce/registry.js";
import { listAlerts, getBudgetSummary } from "../billing/deepseekBudget.js";
import { listFiles } from "../files/registry.js";
import { listPackages } from "../content/store.js";
import { listOutbox } from "../delivery/outbox.js";
import { probeDesktopBot } from "./desktopBot.js";

const DEFAULT_REPORTS_DIR = path.resolve(process.cwd(), "data", "reports");

function existingDir(explicit, envName, fallback, suffix = "") {
  if (explicit) return path.resolve(explicit);
  if (envName && process.env[envName]) return path.resolve(process.env[envName], suffix);
  return path.resolve(fallback, suffix);
}

function redactBudgetSummary(summary) {
  if (!summary) return null;
  return {
    period: summary.period || null,
    currency: summary.currency || "CNY",
    hardStop: !!summary.hardStop,
    alertsCount: Array.isArray(summary.alerts) ? summary.alerts.length : 0,
    amounts: "withheld"
  };
}

function sanitizeError(errorText) {
  if (!errorText) return null;
  const s = String(errorText).trim();
  // Strip out long stack traces and sensitive key-like patterns
  return s
    .replace(/sk-[a-zA-Z0-9_\-]{8,}/g, "sk-***")
    .replace(/(key|token|password|secret|authorization)=[^&\s]+/gi, "$1=***")
    .slice(0, 300);
}

function summarizeReportFile(filePath, name) {
  if (!name.endsWith(".json")) {
    return { kind: "log", outcome: "log file (contents withheld)" };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      kind: "json",
      agent: raw.agent || null,
      ok: raw.ok === undefined ? null : !!raw.ok,
      durationMs: raw.durationMs ?? null,
      error: sanitizeError(raw.error)
    };
  } catch {
    return { kind: "json", outcome: "unreadable" };
  }
}

function sanitizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    agentResolved: t.agentResolved || t.agent,
    status: t.status,
    attemptCount: t.attemptCount || 1,
    startedAt: t.startedAt || null,
    finishedAt: t.finishedAt || null,
    error: sanitizeError(t.error),
    capabilities: t.deliverables?.capabilities || [],
    preworkCompleted: !!t.prework?.completed
  };
}

export function generateSecretaryBrief(config = {}, options = {}) {
  // The brief is a read model. Store helpers create missing directories, so
  // only call them after proving their backing directory already exists.
  const dataRoot = options.baseDir || path.resolve(process.cwd(), "data");
  const tasksDir = existingDir(options.tasksDir, "TASKS_BASE_DIR", dataRoot, "tasks");
  const filesDir = existingDir(options.filesDir, "FILES_BASE_DIR", dataRoot, "files");
  const memoryDir = existingDir(options.memoryDir, "MEMORY_BASE_DIR", dataRoot, "memory");
  const packagesDir = existingDir(options.packagesDir, "PACKAGES_BASE_DIR", dataRoot, "content/packages");
  const workforceDir = existingDir(options.workforceDir, "WORKFORCE_BASE_DIR", dataRoot, "workforce");
  const billingDir = existingDir(options.billingDir, "BILLING_BASE_DIR", dataRoot, "billing");
  const allTasks = fs.existsSync(tasksDir) ? listTasks({ ...options, tasksDir }) : [];

  // 1. Running tasks
  const runningTasks = allTasks
    .filter((t) => ["running", "verifying", "repairing"].includes(t.status))
    .map(sanitizeTask);

  // 2. Recent completed tasks (limit 5)
  const recentCompletedTasks = allTasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => new Date(b.finishedAt || b.updatedAt || 0) - new Date(a.finishedAt || a.updatedAt || 0))
    .slice(0, 5)
    .map(sanitizeTask);

  // 3. Recent failed tasks (limit 5)
  const recentFailedTasks = allTasks
    .filter((t) => t.status === "failed")
    .sort((a, b) => new Date(b.finishedAt || b.updatedAt || 0) - new Date(a.finishedAt || a.updatedAt || 0))
    .slice(0, 5)
    .map(sanitizeTask);

  // 4. Pending approvals (tasks + publish packages)
  const approvalTasks = allTasks.filter((t) => t.status === "awaiting_approval" || t.approvalStatus === "pending");
  let pendingPackages = [];
  try {
    pendingPackages = fs.existsSync(packagesDir) ? (listPackages({ ...options, baseDir: packagesDir }) || []).filter(
      (p) => p.status === "awaiting_approval" || p.approvalStatus === "pending"
    ) : [];
  } catch {
    pendingPackages = [];
  }
  const pendingApprovals = {
    count: approvalTasks.length + pendingPackages.length,
    items: [
      ...approvalTasks.map((t) => ({
        id: t.id,
        title: t.title,
        approvalType: "task",
        riskLevel: t.riskLevel || "high",
        riskReasons: t.riskReasons || [],
        createdAt: t.createdAt
      })),
      ...pendingPackages.map((p) => ({
        id: p.id,
        title: `[发布包] ${p.title || p.id}`,
        approvalType: "publish_package",
        riskLevel: "high",
        riskReasons: [`待审批对外发布包 · 平台: ${p.platform || "xiaohongshu"}`],
        createdAt: p.createdAt
      }))
    ]
  };

  // 5. Latest reports (metadata + sanitized outcome; never stdout/prompt/args)
  const reportsDir = options.reportsDir || process.env.REPORTS_BASE_DIR || DEFAULT_REPORTS_DIR;
  let latestReports = [];
  if (fs.existsSync(reportsDir)) {
    try {
      latestReports = fs
        .readdirSync(reportsDir)
        .filter((name) => name.endsWith(".json") || name.endsWith(".log"))
        .map((name) => {
          const filePath = path.join(reportsDir, name);
          const stat = fs.statSync(filePath);
          return {
            name,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            ...summarizeReportFile(filePath, name)
          };
        })
        .sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
        .slice(0, 5);
    } catch {
      latestReports = [];
    }
  }

  // 6. Recent deliverables (from File Registry and completed tasks)
  let recentDeliverables = [];
  try {
    const files = fs.existsSync(filesDir) ? listFiles({ verified: true }, { ...options, baseDir: filesDir }) : [];
    recentDeliverables = files
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
      .map((f) => ({
        fileId: f.fileId,
        name: f.name,
        path: f.path,
        mime: f.mime,
        size: f.size,
        sendable: f.sendable,
        verified: f.verified,
        createdAt: f.createdAt
      }));
  } catch {
    recentDeliverables = [];
  }

  // Fallback to task deliverables if file registry is empty
  if (recentDeliverables.length === 0) {
    for (const t of recentCompletedTasks) {
      const artifacts = allTasks.find((task) => task.id === t.id)?.deliverables?.artifacts || [];
      for (const a of artifacts) {
        recentDeliverables.push({
          name: a.label || path.basename(a.path),
          path: a.path,
          taskId: t.id,
          verified: true,
          sendable: true
        });
      }
    }
  }

  // 7. Worker status summary
  let workerStatus = [];
  try {
    const workersFile = path.join(workforceDir, "workers.json");
    const hasWorkersRegistry = fs.existsSync(workersFile);
    const registry = hasWorkersRegistry ? getWorkersRegistry({ ...options, baseDir: workforceDir }) : {};
    if (options.skipWorkerProbe || !hasWorkersRegistry) {
      workerStatus = Object.values(registry).map((reg) => ({
        id: reg.id,
        status: reg.status,
        available: reg.status === "AVAILABLE",
        role: reg.role || reg.id,
        billingType: reg.billingType || (reg.id === "hermes" ? "METERED_API" : "SUBSCRIPTION"),
        cooldownCount: reg.cooldownCount || 0
      }));
    } else {
      const healthList = Object.values(workerHealthMap({ probeReadiness: false, config }));
      workerStatus = healthList.map((h) => {
        const reg = registry[h.id] || {};
        return {
          id: h.id,
          status: reg.status || h.status,
          available: h.available && reg.status !== "EXHAUSTED" && reg.status !== "COOLDOWN",
          role: reg.role || h.id,
          billingType: reg.billingType || (h.id === "hermes" ? "METERED_API" : "SUBSCRIPTION"),
          cooldownCount: reg.cooldownCount || 0
        };
      });
    }
    workerStatus = workerStatus.map((worker) => worker.id === "grok-bot"
      ? {
          ...worker,
          status: "UNKNOWN_CONTROL_INTERFACE",
          available: false,
          detail: "未发现外部 Grok Bot.exe 主动回连；仅可打开"
        }
      : worker);
    if (!workerStatus.some((worker) => worker.id === "grok-bot")) {
      workerStatus.push({
        id: "grok-bot",
        status: "UNKNOWN_CONTROL_INTERFACE",
        available: false,
        role: "SECRETARY",
        billingType: "SUBSCRIPTION",
        cooldownCount: 0,
        detail: "未发现外部 Grok Bot.exe 主动回连；仅可打开"
      });
    }
  } catch {
    workerStatus = [];
  }

  // 8. Founder decisions required
  const candidatesDir = path.join(memoryDir, "candidates");
  const pendingCandidates = (fs.existsSync(candidatesDir) ? listCandidates({ ...options, baseDir: memoryDir }) : [])
    .filter((c) => c.status === "candidate")
    .map((c) => ({
      id: c.id,
      title: c.title || c.content || "",
      text: String(c.title || c.content || "").slice(0, 80),
      kind: c.type,
      source: c.source?.kind || "unknown"
    }));

  const billingOpts = { baseDir: billingDir, readOnly: true };
  const activeAlerts = fs.existsSync(billingDir)
    ? (listAlerts(billingOpts) || []).filter((a) => !a.acknowledged)
    : [];

  const decisionItems = [
    ...pendingApprovals.items.map((t) => ({
      type: "task_approval",
      id: t.id,
      summary: `高风险任务待审批：${t.title}`
    })),
    ...pendingCandidates.map((c) => ({
      type: "memory_candidate",
      id: c.id,
      summary: `观点/偏好待确认：${c.text}`
    })),
    ...activeAlerts.map((a) => ({
      type: "budget_alert",
      id: String(a.id),
      summary: "成本预算告警：额度到达硬闸（金额见账单面板）"
    }))
  ];

  const founderDecisionsRequired = {
    totalPending: decisionItems.length,
    pendingApprovalsCount: pendingApprovals.count,
    pendingCandidatesCount: pendingCandidates.length,
    activeAlertsCount: activeAlerts.length,
    items: decisionItems
  };

  // 9. Current system exceptions
  const systemExceptions = [];
  for (const w of workerStatus) {
    if (w.status === "COOLDOWN" || w.status === "EXHAUSTED") {
      systemExceptions.push({
        type: "worker_cooldown",
        level: "warning",
        worker: w.id,
        summary: `模型 ${w.id} 额度冷却中 (已触发 ${w.cooldownCount} 次退避)`
      });
    } else if (w.status === "OFFLINE" && w.id !== "claude") {
      systemExceptions.push({
        type: "worker_offline",
        level: "warning",
        worker: w.id,
        summary: `工作者 ${w.id} 处于离线状态`
      });
    }
  }

  const blockedTasks = allTasks.filter((t) => t.status === "blocked");
  for (const bt of blockedTasks) {
    systemExceptions.push({
      type: "blocked_task",
      level: "error",
      taskId: bt.id,
      summary: `任务被阻断：${bt.title} (${sanitizeError(bt.error) || "原因未知"})`
    });
  }

  for (const alert of activeAlerts) {
    systemExceptions.push({
      type: "budget_alert",
      level: "error",
      alertId: alert.id,
      summary: "预算超限异常：额度到达硬闸（金额见账单面板）"
    });
  }

  let billing = null;
  try {
    billing = fs.existsSync(billingDir)
      ? redactBudgetSummary(getBudgetSummary(billingOpts))
      : null;
  } catch {
    billing = null;
  }

  let desktop = null;
  try {
    desktop = probeDesktopBot(config);
  } catch {
    desktop = null;
  }

  let delivery = [];
  try {
    delivery = listOutbox({}, options).slice(0, 8).map((d) => ({
      deliveryId: d.deliveryId,
      fileId: d.fileId,
      packageId: d.packageId,
      status: d.status
    }));
  } catch {
    delivery = [];
  }

  return {
    generatedAt: new Date().toISOString(),
    runningTasks,
    recentCompletedTasks,
    recentFailedTasks,
    pendingApprovals,
    latestReports,
    recentDeliverables,
    workerStatus,
    billing,
    desktopGrokBot: desktop,
    deliveryOutbox: delivery,
    memoryCandidates: pendingCandidates,
    founderDecisionsRequired,
    systemExceptions
  };
}
