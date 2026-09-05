import path from "path";

/**
 * Prework Workflow Generator
 * When a high-complexity task needs a senior model (e.g. Codex), but that model is
 * out of quota or cooling down, we do NOT allow Antigravity to perform a dangerous,
 * broad architectural rewrite.
 * Instead, Antigravity performs SAFE PREWORK:
 * - Search related files
 * - Trace call chains
 * - Reproduce issues / gather logs
 * - Formulate step-by-step execution plan
 * - Create a checkpoint
 * Then the task transitions to WAITING_FOR_CAPACITY until the senior model rebounds.
 */

export function isPreworkApplicable(task = {}, seniorWorker = "codex", workerStatus = "EXHAUSTED") {
  const isSeniorExhausted = ["EXHAUSTED", "COOLDOWN", "THROTTLED"].includes(workerStatus);
  const isHighValue = task.modelNeed?.requiresSeniorWorker || (task.modelNeed?.modelNeedScore || 0) >= 71;
  const notAlreadyPreworked = !task.prework?.completed;
  return isSeniorExhausted && isHighValue && notAlreadyPreworked;
}

export function buildPreworkPrompt(originalTask, seniorWorker = "codex") {
  return [
    `【SAFE PREWORK ONLY — 严禁直接改动核心架构】`,
    `任务原标题：${originalTask.title}`,
    `任务原说明：${originalTask.description}`,
    ``,
    `当前状态：该任务难度等级评定为 HIGH (Score: ${originalTask.modelNeed?.modelNeedScore || 90})，需要高级工程师模型 (${seniorWorker}) 执行。`,
    `但当前 ${seniorWorker} 处于额度冷却阶段。`,
    ``,
    `【你的当前任务职责 (SAFE PREWORK)】：`,
    `1. 绝对不要直接大范围改动核心业务代码；`,
    `2. 扫描并列出该任务涉及的所有核心文件、接口和依赖调用链；`,
    `3. 梳理问题根因、错误堆栈或变更影响面；`,
    `4. 编写一份清晰、严谨的实施计划与单元测试建议；`,
    `5. 在控制台输出明确的分析结论，并声明 PREWORK CHECKPOINT READY。`,
    ``,
    `高级工程师恢复后，将直接读取你的前置调研产物并接续执行。`
  ].join("\n");
}

export function createPreworkTask(originalTask, seniorWorker = "codex") {
  return {
    ...originalTask,
    isPrework: true,
    targetSeniorWorker: seniorWorker,
    title: `[PREWORK] ${originalTask.title}`,
    description: buildPreworkPrompt(originalTask, seniorWorker),
    agent: "antigravity"
  };
}
