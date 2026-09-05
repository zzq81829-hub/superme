import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createTask } from "../store.js";
import { publishEvent } from "../events/bus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultGoalsDir = path.resolve(__dirname, "../../data/goals");

export function getGoalsDir(options = {}) {
  const dir = options.goalsDir || process.env.GOALS_BASE_DIR || defaultGoalsDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createGoal(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Goal input must be an object");
  }

  const title = String(input.title || "").trim();
  if (!title) throw new Error("Goal 'title' is required");

  const id = input.id || `goal-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const now = new Date().toISOString();

  const goal = {
    id,
    title,
    description: String(input.description || "").trim(),
    business_model: input.business_model || "content_monetization",
    timeframe: input.timeframe || "1m", // 1w, 1m, 3m
    priorities: Array.isArray(input.priorities) ? input.priorities : ["产品打磨", "内容获客", "转化闭环"],
    anti_goals: Array.isArray(input.anti_goals) ? input.anti_goals : ["不做大额未验证投流", "不做不可逆删除"],
    status: input.status || "active",
    createdAt: now,
    updatedAt: now
  };

  const dir = getGoalsDir(options);
  const file = path.join(dir, `${id}.json`);
  const tmpFile = path.join(dir, `${id}.json.tmp.${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmpFile, JSON.stringify(goal, null, 2), "utf8");
  fs.renameSync(tmpFile, file);

  publishEvent({
    type: "goal_created",
    project_id: "strategy",
    source: "founder_or_ceo",
    outcome: "success",
    payload: goal
  }, options);

  return goal;
}

export function listGoals(options = {}) {
  const dir = getGoalsDir(options);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes(".tmp"));
  const goals = [];

  for (const f of files) {
    try {
      goals.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch {
      // ignore
    }
  }

  goals.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return goals;
}

export function getGoal(id, options = {}) {
  const dir = getGoalsDir(options);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function generatePlan(input = {}, options = {}) {
  let goal = null;
  if (input.goal_id) {
    goal = getGoal(input.goal_id, options);
  }

  const objective = String(input.objective || goal?.title || "").trim();
  if (!objective) throw new Error("Field 'objective' or valid 'goal_id' is required to generate plan");

  const planId = `plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const now = new Date().toISOString();

  // Autonomous Decomposition: Goal -> Milestones -> Experiments -> Tasks
  const isXhsMonetization = /小红书|变现|卖货|获客|流量/i.test(objective);

  const planStructure = {
    plan_id: planId,
    goal_id: goal?.id || null,
    objective,
    milestones: isXhsMonetization ? [
      {
        id: "M1",
        name: "高转化内容原型验证",
        experiments: [
          { id: "EXP-01", name: "海外高赞认知纠偏 (Gold chance)", hypothesis: "客观求真纠偏卡片具备极高收藏率与自然裂变" },
          { id: "EXP-02", name: "深度书斋图书卡片 (good try)", hypothesis: "画报级经典书摘具备高停留与知识付费潜力" }
        ]
      },
      {
        id: "M2",
        name: "引流与转化载体搭建",
        experiments: [
          { id: "EXP-03", name: "合规评论区置顶与粉丝转化链路", hypothesis: "作者置顶排序能有效引导深度互动与私域承接" }
        ]
      }
    ] : [
      {
        id: "M1",
        name: "系统自洽与功能基石",
        experiments: [
          { id: "EXP-01", name: "核心链路端到端闭环验证", hypothesis: "最小化改动保障现有功能 0 回归" }
        ]
      }
    ]
  };

  // Generate concrete tasks
  const rawTasks = [];
  if (isXhsMonetization) {
    rawTasks.push({
      title: "【Gold chance】海外优质选题调研与求真纠偏卡片草稿生成",
      body: "基于 agent-reach 调研海外高赞选题，生成暗黑模式 1080x1440 翻译卡片并进行可行性逐条标注。",
      project: "xiaohongshu",
      acceptanceCriteria: [],
      agent: "auto",
      reasoningMode: "auto"
    });
    rawTasks.push({
      title: "【good try】经典书斋画报卡片排版草稿生成",
      body: "严格遵循 card-layout-standard 标准（大呼吸间距、半透明微卡片、底座实体收尾卡），排版书摘草稿。",
      project: "shuzhai",
      acceptanceCriteria: [],
      agent: "auto",
      reasoningMode: "auto"
    });
  } else {
    rawTasks.push({
      title: `【自主执行】${objective} 基础任务执行`,
      body: `根据目标：“${objective}”，自动组织工序与验收基准并执行。`,
      project: "general",
      acceptanceCriteria: [],
      agent: "auto",
      reasoningMode: "auto"
    });
  }

  // Create tasks in store if requested
  const createdTasks = [];
  if (options.persistTasks !== false) {
    for (const t of rawTasks) {
      const created = createTask({
        ...t,
        status: "queued",
        planId
      }, options);
      createdTasks.push(created);
    }
  }

  const generatedPlan = {
    ...planStructure,
    tasks: createdTasks.length > 0 ? createdTasks : rawTasks,
    createdAt: now
  };

  publishEvent({
    type: "plan_generated",
    project_id: goal?.id || "general",
    source: "autonomous_planner",
    outcome: "success",
    payload: {
      plan_id: planId,
      objective,
      task_count: rawTasks.length
    }
  }, options);

  return generatedPlan;
}
