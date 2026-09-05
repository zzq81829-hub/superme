import crypto from "crypto";
import { createTask, getTask, updateTask, listSubtasks } from "../store.js";
import { runAgent } from "../adapters/runAgent.js";
import { dispatchTask } from "../router.js";
import { loadConfig } from "../config.js";
import { publishEvent } from "../events/bus.js";

/**
 * Parses structured dispatch plan JSON from Hermes's response text.
 * Tolerates markdown fences, raw JSON arrays, or DISPATCH_PLAN: prefixes.
 */
export function parseDispatchPlan(text = "") {
  if (!text || typeof text !== "string") return [];

  // Match ```json:dispatch_plan ... ``` or ```json ... ```
  const fenceRegex = /```(?:json:dispatch_plan|json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i;
  const fenceMatch = text.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (Array.isArray(parsed)) return sanitizeSubtasks(parsed);
    } catch {
      // Continue to next heuristic
    }
  }

  // Match DISPATCH_PLAN: [...]
  const planTagRegex = /DISPATCH_PLAN\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/i;
  const tagMatch = text.match(planTagRegex);
  if (tagMatch && tagMatch[1]) {
    try {
      const parsed = JSON.parse(tagMatch[1]);
      if (Array.isArray(parsed)) return sanitizeSubtasks(parsed);
    } catch {
      // Continue to next heuristic
    }
  }

  // Match raw JSON array of objects with "title" or "agent"
  const rawArrayRegex = /(\[\s*\{\s*"(?:title|agent|description|task)"[\s\S]*?\}\s*\])/i;
  const rawMatch = text.match(rawArrayRegex);
  if (rawMatch && rawMatch[1]) {
    try {
      const parsed = JSON.parse(rawMatch[1]);
      if (Array.isArray(parsed)) return sanitizeSubtasks(parsed);
    } catch {
      // Fallback
    }
  }

  return [];
}

function sanitizeSubtasks(tasks = []) {
  const validAgents = ["codex", "antigravity", "grok", "grok-build", "claude", "deepseek", "auto"];
  return tasks
    .filter((t) => t && (t.title || t.name || t.task))
    .map((t) => {
      const rawAgent = String(t.agent || t.worker || "auto").toLowerCase().trim();
      const agent = validAgents.includes(rawAgent) ? rawAgent : "auto";
      const title = String(t.title || t.name || t.task).trim();
      const description = String(t.description || t.body || t.detail || title).trim();
      const criteria = Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : (Array.isArray(t.criteria) ? t.criteria : []);
      return {
        title,
        description,
        agent,
        acceptanceCriteria: criteria.map(String)
      };
    });
}

/**
 * Builds the COO requirement decomposition prompt for Hermes.
 */
export function buildHermesDecompositionPrompt(requirement, options = {}) {
  const projectPath = options.projectPath || process.cwd();
  return [
    "You are Hermes, the Chief Operating Officer (COO) of AI Founder OS.",
    "The Local Control Center (:3210) is the AI CEO holding the task ledger, budget guard, and risk approvals.",
    "",
    "YOUR ROLE AS COO:",
    "Your objective is to decompose the following founder requirement into concrete, actionable subtasks and assign each subtask to the most suitable specialized worker in our workforce.",
    "",
    "WORKFORCE CAPABILITY MATRIX:",
    "1. codex: Architecture, complex backend logic, algorithmic implementation, database schemas, strict unit tests.",
    "2. antigravity: Frontend UI, CSS/HTML, card layouts, graphic notes (Xiaohongshu card layout standard), multi-file refactoring.",
    "3. grok / grok-build: Information retrieval, external intelligence, market/trend research, topic discovery.",
    "4. claude: Code review, security/architecture auditing, regression hunting.",
    "5. deepseek: High-volume text processing, summarization, rewriting, low-cost batch jobs.",
    "",
    `FOUNDER REQUIREMENT:`,
    requirement,
    "",
    `PROJECT PATH: ${projectPath}`,
    "",
    "OUTPUT FORMAT REQUIREMENT:",
    "You must provide a clear executive COO breakdown explaining your orchestration strategy, followed by a machine-parsable JSON block enclosed in ```json:dispatch_plan containing the array of subtasks.",
    "",
    "Example format:",
    "```json:dispatch_plan",
    "[",
    "  {",
    '    "title": "Subtask 1 Title",',
    '    "description": "Concrete instructions for worker",',
    '    "agent": "codex",',
    '    "acceptanceCriteria": ["存在: path/to/file", "运行: npm test"]',
    "  }",
    "]",
    "```",
    "",
    "CAN_USE: Hermes COO requirement decomposition and workforce dispatch plan.",
    "ARTIFACT: data/tasks/"
  ].join("\n");
}

/**
 * Dispatches subtasks into the OS store linked to parentTaskId.
 */
export function dispatchSubtasks(parentTaskId, subtaskDefs = [], options = {}) {
  const config = options.config || loadConfig();
  const parent = getTask(parentTaskId, options);
  const projectPath = options.projectPath || parent?.projectPath || "";
  const planId = options.planId || parent?.planId || `plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const createdTasks = [];
  const subtaskIds = [];

  for (const def of subtaskDefs) {
    const subtask = createTask({
      title: def.title,
      description: def.description,
      agent: def.agent || "auto",
      projectPath,
      parentTaskId,
      planId,
      acceptanceCriteria: def.acceptanceCriteria || [],
      source: "hermes_coo"
    }, options);

    createdTasks.push(subtask);
    subtaskIds.push(subtask.id);

    // Queue & dispatch subtask if autoRun enabled
    if (options.autoRun !== false && subtask.riskLevel !== "high") {
      updateTask(subtask.id, { status: "queued" }, options);
      const runner = options.dispatchTask || dispatchTask;
      runner(subtask.id, config).catch((err) => {
        try {
          updateTask(subtask.id, {
            status: "failed",
            error: err?.stack || String(err),
            finishedAt: new Date().toISOString()
          }, options);
        } catch {}
      });
    }
  }

  // Update parent task with child references
  if (parent) {
    const existingSubtaskIds = Array.isArray(parent.subtaskIds) ? parent.subtaskIds : [];
    const allSubtaskIds = Array.from(new Set([...existingSubtaskIds, ...subtaskIds]));
    updateTask(parentTaskId, {
      subtaskIds: allSubtaskIds,
      planId,
      deliverables: {
        summary: `Hermes COO 已完成需求拆解，成功分发 ${createdTasks.length} 个专业子任务`,
        subtasks: createdTasks.map((t) => ({
          id: t.id,
          title: t.title,
          agent: t.agent,
          status: t.status
        }))
      }
    }, options);
  }

  publishEvent({
    type: "hermes_subtasks_dispatched",
    project_id: parent?.project || "general",
    source: "hermes_coo",
    outcome: "success",
    payload: {
      parentTaskId,
      planId,
      subtaskCount: createdTasks.length,
      subtaskIds
    }
  }, options);

  return createdTasks;
}

/**
 * End-to-end requirement decomposition and dispatch by Hermes COO.
 */
export async function decomposeAndDispatchRequirement(requirement, options = {}) {
  const config = options.config || loadConfig();
  const title = options.title || requirement.split(/[。\n!?；;]/)[0].trim().slice(0, 40) || "Hermes 需求拆解与分发";
  const projectPath = options.projectPath || config.workspaceRoot || process.cwd();

  // 1. Create the parent COO orchestration task
  const parentTask = createTask({
    title: `[Hermes 统筹] ${title}`,
    description: requirement,
    agent: "hermes",
    delegateToHermes: true,
    projectPath,
    source: options.source || "founder_coo_dispatch",
    acceptanceCriteria: ["Hermes COO 完成需求拆解并分发专业子任务"]
  }, options);

  updateTask(parentTask.id, { status: "running" }, options);

  // 2. Build COO prompt & run Hermes
  const prompt = buildHermesDecompositionPrompt(requirement, { projectPath });
  const taskForRun = {
    ...parentTask,
    prompt
  };

  let runResult;
  try {
    if (options.dryRun || config.dryRun) {
      runResult = {
        ok: true,
        dryRun: true,
        message: [
          "Hermes COO 规划就绪：",
          "```json:dispatch_plan",
          JSON.stringify([
            {
              title: `【架构与后端】${title} - 核心数据与逻辑层`,
              description: `根据需求：${requirement}，构建底层模型与业务 API。`,
              agent: "codex",
              acceptanceCriteria: ["npm test"]
            },
            {
              title: `【界面与卡片】${title} - 前端与排版交互`,
              description: `根据需求：${requirement}，实现用户交互与画报排版。`,
              agent: "antigravity",
              acceptanceCriteria: []
            }
          ], null, 2),
          "```",
          "CAN_USE: Hermes COO 拆解已完成",
          `ARTIFACT: data/tasks/${parentTask.id}.json`
        ].join("\n")
      };
    } else {
      const runner = options.runAgent || runAgent;
      runResult = await runner("hermes", taskForRun, projectPath, config);
    }
  } catch (error) {
    runResult = { ok: false, error: error?.message || String(error) };
  }

  const outputText = runResult.message || runResult.preview || runResult.stdout || "";
  const subtaskDefs = parseDispatchPlan(outputText);

  // If Hermes didn't return valid JSON, generate sensible fallback subtasks from requirement
  const finalSubtasks = subtaskDefs.length > 0 ? subtaskDefs : [
    {
      title: `【架构执行】${title}`,
      description: `依据需求：“${requirement}”，由 Codex 落实核心功能与逻辑。`,
      agent: "codex",
      acceptanceCriteria: []
    },
    {
      title: `【交付与优化】${title}`,
      description: `依据需求：“${requirement}”，由 Antigravity 落实界面、样式与整合。`,
      agent: "antigravity",
      acceptanceCriteria: []
    }
  ];

  // 3. Dispatch child subtasks into the OS store
  const dispatched = dispatchSubtasks(parentTask.id, finalSubtasks, {
    config,
    projectPath,
    autoRun: options.autoRun !== false,
    dispatchTask: options.dispatchTask
  });

  // 4. Mark parent task as completed
  const completedParent = updateTask(parentTask.id, {
    status: runResult.ok ? "completed" : "failed",
    result: runResult,
    finishedAt: new Date().toISOString(),
    error: runResult.ok ? null : runResult.error
  }, options);

  return {
    parentTask: completedParent,
    subtasks: dispatched,
    planText: outputText
  };
}
