/**
 * Model Need Evaluator
 * Evaluates the cognitive, architectural, and risk demands of a task to determine
 * which model tier and worker is genuinely required.
 */

const ARCHITECTURAL_CORE_KEYWORDS = [
  /architecture|架构设计|跨模块|cross-module|并发|concurrency|底层协议|protocol|状态机|state machine/i,
  /核心系统|core system|调度器|scheduler|内核|kernel|解析器|parser|编译器|compiler|算法优化|algorithm/i,
  /疑难|difficult bug|race condition|deadlock|内存泄漏|memory leak|深层排查|root cause/i
];

const UI_STYLING_KEYWORDS = [
  /hover|css|样式|ui微调|ui|界面|按钮|button|前端|组件样式|边框|颜色|动效|排版|margin|padding/i
];

const RESEARCH_KEYWORDS = [
  /调研|research|对比分析|benchmark|竞品分析|市场分析|行业趋势|多方案比较|深入搜索|deep search/i,
  /最新动态|前沿进展|战略分析|产品分析|生态分析/i
];

const REVIEW_KEYWORDS = [
  /review|代码审查|审核|代码评审|质量检查|验收评审/i
];

const LOW_COMPLEXITY_KEYWORDS = [
  /hover|css|样式|ui微调|ui|界面|按钮|button|前端|文案|拼写|typo|注释|comment|格式化|format|加个按钮|add button/i,
  /修改文件|整理文件|移动文件|重命名|rename|列出|list files|查一下|找一下/i,
  /简单修改|小修|minor fix|trivial|文档修正/i
];

export function evaluateModelNeed(task = {}) {
  const text = `${task.title || ""}\n${task.description || ""}\n${(task.acceptanceCriteria || []).join(" ")}`.toLowerCase();

  let complexity = 30;
  let risk = task.riskLevel === "high" ? 70 : 20;
  let reversibility = 20; // 0 = easily reversible (e.g. css/doc), 100 = hard/irreversible
  let reasoningNeed = 30;
  let researchNeed = 10;
  let contextSize = 30;

  // Domain detection
  let domain = "coding";
  if (RESEARCH_KEYWORDS.some((kw) => kw.test(text))) {
    domain = "research";
    researchNeed += 50;
    reasoningNeed += 20;
    complexity += 25;
  }
  if (REVIEW_KEYWORDS.some((kw) => kw.test(text))) {
    domain = "review";
    reasoningNeed += 30;
  }

  const isDeepResearch = /深入|深度|大范围|战略|多方案比较|复杂产品分析|生态分析|deep search/i.test(text);
  if (isDeepResearch) {
    domain = "research";
    complexity = Math.max(complexity, 85);
    researchNeed = Math.max(researchNeed, 90);
    reasoningNeed = Math.max(reasoningNeed, 80);
  }

  // Check low complexity
  if (LOW_COMPLEXITY_KEYWORDS.some((kw) => kw.test(text))) {
    complexity = Math.max(10, complexity - 20);
    reasoningNeed = Math.max(10, reasoningNeed - 20);
    reversibility = 10;
  }

  // Check high complexity:
  // Architectural/core keywords trigger high complexity.
  // "重构" alone without architectural context does NOT trigger high complexity,
  // especially when simple UI/styling terms (like "重构按钮" or "hover") are present.
  const hasArchitecturalContext = ARCHITECTURAL_CORE_KEYWORDS.some((kw) => kw.test(text));
  const isUiStyling = UI_STYLING_KEYWORDS.some((kw) => kw.test(text));

  const isHighComplexity = hasArchitecturalContext && (!isUiStyling || /(?:底层|架构|调度器|并发|状态机|内核|protocol|algorithm|核心)/i.test(text));
  if (isHighComplexity) {
    complexity = Math.max(complexity, 90);
    reasoningNeed = Math.max(reasoningNeed, 85);
    reversibility = Math.max(reversibility, 75);
    contextSize = Math.max(contextSize, 70);
    risk = Math.max(risk, 70);
  }

  // Long description often implies larger context
  if (text.length > 500) {
    contextSize = Math.min(100, contextSize + 25);
    complexity = Math.min(100, complexity + 10);
  }

  // Weighted score calculation: 0-100
  let modelNeedScore = Math.round(
    complexity * 0.35 +
    reasoningNeed * 0.30 +
    risk * 0.15 +
    reversibility * 0.10 +
    (domain === "research" ? researchNeed * 0.10 : contextSize * 0.10)
  );
  if (isHighComplexity || isDeepResearch) {
    modelNeedScore = Math.max(modelNeedScore, 75);
  }

  let tier = "LOW";
  let preferredWorker = "antigravity";

  if (modelNeedScore <= 35) {
    tier = "LOW";
    preferredWorker = "antigravity";
  } else if (modelNeedScore <= 70) {
    tier = "MEDIUM";
    if (domain === "review") {
      preferredWorker = "claude";
    } else if (domain === "research" && researchNeed >= 60) {
      preferredWorker = "grok-build";
    } else {
      preferredWorker = "antigravity";
    }
  } else {
    tier = "HIGH";
    if (domain === "research") {
      preferredWorker = "grok-build";
    } else if (domain === "review") {
      preferredWorker = "claude";
    } else {
      preferredWorker = "codex";
    }
  }

  return {
    modelNeedScore,
    tier,
    domain,
    preferredWorker,
    metrics: {
      complexity,
      risk,
      reversibility,
      reasoningNeed,
      researchNeed,
      contextSize
    },
    requiresSeniorWorker: tier === "HIGH"
  };
}
