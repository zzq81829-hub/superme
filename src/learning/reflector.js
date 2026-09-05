import { queryEvents, publishEvent } from "../events/bus.js";
import { listTasks } from "../store.js";
import { saveLesson } from "../memory/lessons.js";
import { getPolicy, updatePolicy } from "../policy/policyManager.js";

export async function runReflection(options = {}) {
  const timeframeHours = options.timeframeHours || 48;
  const since = new Date(Date.now() - timeframeHours * 3600 * 1000).toISOString();

  // 1. Gather events and tasks
  const events = queryEvents({ since }, options);
  const tasks = listTasks(options) || [];

  const completedTasks = tasks.filter(t => t.status === "completed");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const verifiedTasks = tasks.filter(t => t.verification);

  // 2. Statistical Analysis
  const totalTasks = completedTasks.length + failedTasks.length;
  const successRate = totalTasks > 0 ? completedTasks.length / totalTasks : 1.0;

  const agentStats = {};
  for (const t of tasks) {
    const a = t.agentResolved || t.agent || "unknown";
    if (!agentStats[a]) agentStats[a] = { total: 0, completed: 0, failed: 0 };
    agentStats[a].total += 1;
    if (t.status === "completed") agentStats[a].completed += 1;
    if (t.status === "failed") agentStats[a].failed += 1;
  }

  // 3. Extract Observations
  const observations = [];
  observations.push(`最近 ${timeframeHours} 小时统计：总任务 ${totalTasks} 个，成功率 ${(successRate * 100).toFixed(1)}%`);

  for (const [agent, st] of Object.entries(agentStats)) {
    const rate = st.total > 0 ? (st.completed / st.total) * 100 : 0;
    observations.push(`Agent '${agent}': 派发 ${st.total} 次，成功率 ${rate.toFixed(1)}%`);
  }

  // 4. Extract Hypotheses & Lessons
  const hypotheses = [];
  const lessons = [];
  const policyUpdates = [];

  // Observation pattern A: High failure rate or repeated retries
  if (failedTasks.length > 0) {
    const failureReasons = failedTasks.map(t => t.error || t.verification?.issues?.join("; ") || "Unknown issue");
    hypotheses.push(`部分任务失败主要集中在：${failureReasons.slice(0, 3).join(" | ")}`);

    const hasRefactorFailures = failedTasks.some(t => /refactor|重构|跨文件/i.test(t.title || ""));
    if (hasRefactorFailures) {
      lessons.push({
        lesson: "复杂跨文件重构任务使用普通推理容易出现逻辑遗漏或未声明破坏",
        domain: "coding",
        confidence: 0.85,
        recommended_action: "涉及重构或多文件修改的任务强制自动启用 boost 深度推理",
        policyTarget: "boost_policy",
        policyPatch: { rules: { auto_boost_on_refactor: true, boost_threshold: 0.65 } }
      });
    }
  } else {
    observations.push("近期任务执行与自动化回归验证保持 100% 成功");
  }

  // Observation pattern B: UI/Frontend performance
  const frontendTasks = tasks.filter(t => /ui|前端|样式|卡片/i.test(t.title || ""));
  if (frontendTasks.length >= 2 && frontendTasks.every(t => t.status === "completed")) {
    lessons.push({
      lesson: "轻量 UI 与卡片渲染任务 Antigravity 表现优异且零成本消耗",
      domain: "frontend",
      confidence: 0.90,
      recommended_action: "前端轻量卡片与文案任务优先分配 Antigravity",
      policyTarget: "agent_router",
      policyPatch: { rules: { frontend: { antigravity_weight: 0.90, codex_weight: 0.10 } } }
    });
  }

  // Save generated lessons
  const savedLessons = [];
  for (const l of lessons) {
    const saved = saveLesson(l, options);
    savedLessons.push(saved);
    if (l.policyTarget && l.policyPatch) {
      policyUpdates.push({
        policy: l.policyTarget,
        patch: l.policyPatch,
        reason: l.lesson
      });
    }
  }

  // 5. Apply Safe Policy Adjustments if requested or high confidence
  const appliedPolicyChanges = [];
  if (options.autoApplyPolicies !== false && policyUpdates.length > 0) {
    for (const update of policyUpdates) {
      try {
        const updatedPolicy = updatePolicy(update.policy, update.patch, options);
        appliedPolicyChanges.push({
          policy: update.policy,
          rules: updatedPolicy.rules,
          reason: update.reason
        });
      } catch (err) {
        // Safe skip on error
      }
    }
  }

  const reflectionReport = {
    id: `ref-${Date.now()}`,
    timeframeHours,
    stats: {
      totalTasks,
      completed: completedTasks.length,
      failed: failedTasks.length,
      successRate: Math.round(successRate * 100) / 100,
      agentStats
    },
    observations,
    hypotheses,
    lessons: savedLessons,
    recommended_policy_updates: policyUpdates,
    applied_policy_changes: appliedPolicyChanges,
    next_experiments: [
      "持续追踪自主派工与自适应推理的单位成本与产出比",
      "在小红书双轨内容中测试高权重爆款标签与转化引导"
    ],
    timestamp: new Date().toISOString()
  };

  // 6. Publish reflection_completed event
  publishEvent({
    type: "reflection_completed",
    project_id: "os_governance",
    source: "autonomous_reflector",
    outcome: "success",
    metrics: {
      lessonsGenerated: savedLessons.length,
      policyChangesApplied: appliedPolicyChanges.length,
      successRate
    },
    payload: reflectionReport
  }, options);

  return reflectionReport;
}
