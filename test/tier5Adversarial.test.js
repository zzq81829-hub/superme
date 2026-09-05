import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import {
  evaluateCompliance,
  checkTier1Legality,
  checkTier2PlatformRules,
  filterContextualSafePass,
  recordAuditLog,
  normalizeText
} from "../src/autonomous_content/complianceFirewall.js";

import {
  evaluateCircadianWindow,
  calculateBioJitter,
  selectVerticalHashtags,
  processPublishQueue,
  processQueue,
  calculateNextPublishSlot,
  enqueueQueueItem,
  releaseQueueItem,
  loadSchedulerQueue,
  saveSchedulerQueue,
  CIRCADIAN_WINDOWS,
  QUIET_HOURS
} from "../src/autonomous_content/circadianScheduler.js";

import {
  runAutonomousContentPipeline
} from "../src/autonomous_content/index.js";

function createDate(hours, minutes, seconds = 0, dayOffset = 0) {
  const d = new Date(2026, 8, 4, hours, minutes, seconds, 0); // 2026-09-04 (month 8 is September)
  if (dayOffset !== 0) {
    d.setDate(d.getDate() + dayOffset);
  }
  return d;
}

function createTempFile(namePrefix = "adv-test-", ext = ".json") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tier5-adv-"));
  return path.join(dir, `${namePrefix}${Date.now()}${ext}`);
}

// ============================================================================
// SECTION 1: COMPLIANCE FIREWALL ADVERSARIAL EVASION TESTS
// ============================================================================

test("Adversarial 1.1: Interstitial Symbols & Non-Standard Delimiters Bypass Attempts", () => {
  // Attackers try separators: @, #, $, %, +, =, &, 【】, (), emojis, etc.
  const symbolEvasions = [
    // Standard separators (already supported)
    { text: "第.一的自媒体课", target: "第一", mustIntercept: true },
    { text: "第_一的自媒体课", target: "第一", mustIntercept: true },
    { text: "第-一的自媒体课", target: "第一", mustIntercept: true },
    { text: "第 一的自媒体课", target: "第一", mustIntercept: true },
    { text: "微·信咨询", target: "微信", mustIntercept: true },
    { text: "加_v领取", target: "加v", mustIntercept: true },
    { text: "稳~赚~不~赔", target: "稳赚不赔", mustIntercept: true },

    // Exotic / non-standard separators
    { text: "第@一的运营策略", target: "第一", mustIntercept: true },
    { text: "第#一的运营策略", target: "第一", mustIntercept: true },
    { text: "微#信联系", target: "微信", mustIntercept: true },
    { text: "加+v了解更多", target: "加v", mustIntercept: true },
    { text: "加➕v免费送", target: "加v", mustIntercept: true },
    { text: "第+一的知识库", target: "第一", mustIntercept: true },
    { text: "【第】【一】的商业课程", target: "第一", mustIntercept: true },
    { text: "(第)(一)好用的AI工具", target: "第一", mustIntercept: true },
    { text: "微@信发资料", target: "微信", mustIntercept: true },
    { text: "绝#对有效", target: "绝对", mustIntercept: true },
    { text: "绝@对有效", target: "绝对", mustIntercept: true },
    { text: "稳#赚#不#赔的项目", target: "稳赚不赔", mustIntercept: true }
  ];

  const results = symbolEvasions.map((item) => {
    const t1 = checkTier1Legality(item.text);
    const t2 = checkTier2PlatformRules(item.text);
    const intercepted = !t1.passed || !t2.passed;
    return {
      text: item.text,
      target: item.target,
      intercepted,
      violations: [...t1.violations, ...t2.violations]
    };
  });

  const evaded = results.filter((r) => !r.intercepted);
  // Log results for forensic reporting
  console.log(`[Adversarial 1.1] Tested ${results.length} symbol evasions. Evaded: ${evaded.length}`);
  if (evaded.length > 0) {
    console.log("[Adversarial 1.1 EVASION DETECTED]:", evaded.map((e) => e.text));
  }
  assert.equal(evaded.length, 0, `Evasion vulnerabilities exposed in interstitial symbols: ${evaded.map((e) => e.text).join(", ")}`);
});

test("Adversarial 1.2: Zero-Width Characters & Invisible Unicode Evasion", () => {
  const zeroWidthCases = [
    // Zero-width space \u200B
    "第\u200B一\u200B名",
    "加\u200Bv\u200B领资料",
    "微\u200B信\u200B私我",
    // Zero-width non-joiner \u200C
    "绝\u200C对\u200C有效",
    // Zero-width joiner \u200D
    "稳\u200D赚\u200D不\u200D赔",
    // BOM \uFEFF
    "包\uFEFF治\uFEFF百\uFEFF病",
    // Mixed zero-width sequences
    "最\u200B\u200C\u200D高\uFEFF品质",
    // Word joiner \u2060
    "第\u2060一\u2060课",
    "加\u2060v\u2060领",
    // Non-breaking space \u00A0
    "微\u00A0信\u00A0发你"
  ];

  let interceptedCount = 0;
  const evasions = [];
  for (const text of zeroWidthCases) {
    const t1 = checkTier1Legality(text);
    const t2 = checkTier2PlatformRules(text);
    if (!t1.passed || !t2.passed) {
      interceptedCount++;
    } else {
      evasions.push(text);
    }
  }

  console.log(`[Adversarial 1.2] Tested ${zeroWidthCases.length} zero-width cases. Intercepted: ${interceptedCount}, Evaded: ${evasions.length}`);
  if (evasions.length > 0) {
    console.log("[Adversarial 1.2 EVASION DETECTED]:", evasions);
  }
  assert.equal(evasions.length, 0, `Evasion vulnerabilities exposed in zero-width / invisible unicode: ${evasions.join(", ")}`);
});

test("Adversarial 1.3: Pinyin Homophones & Disguised WeChat/Off-Platform Diversion", () => {
  const homophoneCases = [
    { text: "想学的加微了解", expected: "加微" },
    { text: "想学的加薇了解", expected: "加薇" },
    { text: "想学的加威了解", expected: "加威" },
    { text: "想学的加维了解", expected: "加维" },
    { text: "想学的加芯了解", expected: "加芯" },
    { text: "想学的加星了解", expected: "加星" },
    { text: "私我领高清原图", expected: "私我领" },
    { text: "私聊我发你全套", expected: "私聊" },
    { text: "私liao我获取", expected: "私liao" },
    { text: "点击进群领取绝密清单", expected: "进群" },
    { text: "点击进裙领取绝密清单", expected: "进裙" },
    { text: "点击入裙获取资源", expected: "入裙" },
    { text: "我的vx号是 growth888", expected: "vx号" },
    { text: "我的wx号是 growth888", expected: "wx号" },
    { text: "某宝搜索同名店铺", expected: "某宝" },
    { text: "某鱼拍下即可", expected: "某鱼" },
    { text: "某多多拼单优惠", expected: "某多多" },
    { text: "招募网络兼职刷单，日赚千元", expected: "刷单" },
    { text: "挂机躺赚项目，日赚百元", expected: "躺赚" },
    { text: "看我主页背景有联系方式", expected: "主页背景" },
    { text: "主页有微可以添加", expected: "主页有微" },
    { text: "主页有v可以交流", expected: "主页有v" },
    { text: "主页置顶有联系方式", expected: "主页置顶有" },
    // Emerging homophone tricks
    { text: "卫心私我领取资料", expected: "卫心" },
    { text: "微心私我发你", expected: "微心" },
    { text: "卫星私我发你", expected: "卫星" },
    { text: "加v芯获取", expected: "v芯" }
  ];

  let interceptedCount = 0;
  const evaded = [];
  for (const item of homophoneCases) {
    const t1 = checkTier1Legality(item.text);
    const t2 = checkTier2PlatformRules(item.text);
    if (!t1.passed || !t2.passed) {
      interceptedCount++;
    } else {
      evaded.push(item.text);
    }
  }

  console.log(`[Adversarial 1.3] Tested ${homophoneCases.length} homophone cases. Intercepted: ${interceptedCount}, Evaded: ${evaded.length}`);
  if (evaded.length > 0) {
    console.log("[Adversarial 1.3 EVASION DETECTED]:", evaded);
  }
});

test("Adversarial 1.4: Disguised WeChat QR Text & Scan-to-Add Patterns", () => {
  const qrCases = [
    "长按识别图中二维码领取全套复习资料",
    "扫描下方二维码，免费获取高清架构图",
    "保存图片扫描二维码添加助理",
    "二维码见图3，扫码直接进交流群",
    "截图去微信扫一扫，获取工具包",
    "长按图片识别二维码，加入读者交流会",
    "扫描文末二维码即可领取",
    "扫码进群免费领电子书",
    "扫码添加作者微信"
  ];

  let interceptedCount = 0;
  const evaded = [];
  for (const text of qrCases) {
    const t1 = checkTier1Legality(text);
    const t2 = checkTier2PlatformRules(text);
    if (!t1.passed || !t2.passed) {
      interceptedCount++;
    } else {
      evaded.push(text);
    }
  }

  console.log(`[Adversarial 1.4] Tested ${qrCases.length} QR/scan cases. Intercepted: ${interceptedCount}, Evaded: ${evaded.length}`);
  if (evaded.length > 0) {
    console.log("[Adversarial 1.4 EVASION DETECTED]:", evaded);
  }
  assert.equal(evaded.length, 0, `Evasion vulnerabilities exposed in QR / scan-to-add text: ${evaded.join(", ")}`);
});

test("Adversarial 1.5: Multi-Clause Advertising Law Superlative Stacking", () => {
  const complexSuperlativeCases = [
    {
      title: "全网最顶级的自媒体思考法，史上最强没有之一",
      body: "这套体系绝对有效，经过我们独创的国家级标准打磨，堪称业内第一的实战指南，保你稳赚不赔零风险。",
      tags: ["#顶级", "#全网第一", "#独家首发"],
      slides: [
        { title: "天下第一思维", content: "包治百病的学习神药，彻底根治思维懒惰" },
        { title: "终极秘籍", content: "史上最全清单，私聊我微信领全套" }
      ]
    },
    {
      title: "世界级前沿研究独家首发",
      body: "如果这都不算行业最佳，世上就没有最好的了。唯一能够实现彻底根治内耗的神奇方法，永久免费分享。",
      tags: ["#世界级", "#最佳", "#唯一"]
    }
  ];

  for (const pkg of complexSuperlativeCases) {
    const evalRes = evaluateCompliance(pkg);
    assert.equal(evalRes.passed, false, "Stacked superlative package must be strictly blocked");
    assert.equal(evalRes.riskLevel, "blocked");
    assert.ok(evalRes.tier1Violations.length >= 3, `Expected >= 3 tier1 violations, got ${evalRes.tier1Violations.length}`);
    assert.ok(evalRes.matchedKeywords.length >= 3);
    assert.ok(evalRes.suggestions.length >= 1);
  }
});

test("Adversarial 1.6: Boundary Contextual Safe-Pass vs Disqualified Bypass Stress", () => {
  // Pure legitimate sentences: MUST PASS >= 98%
  const legitimateCorpus = [
    "第一步是明确核心业务流程",
    "第一次接触这个AI模型时深感震撼",
    "第一天打卡记录学习心得",
    "第一时间同步关键决策结果",
    "第一反应往往反映了潜意识认知",
    "第一阶段的验证工作顺利完成",
    "第一章主要阐述基本假设与模型定义",
    "第一原则是实事求是严谨治学",
    "第一志愿填报需要综合考虑多种因素",
    "第一学历固然重要但不是全部",
    "这是论文的第一作者给出的补充说明",
    "第一印象往往受到初始信息的锚定影响",
    "第一桶金的积累最需要认知突破",
    "第一产业的发展是经济的基石",
    "第一宇宙速度是环绕地球轨道的关键",
    "绝对值的定义是非负实数",
    "编程中使用绝对路径可以避免相对位置解析失误",
    "绝对坐标与相对坐标各有适用场景",
    "绝对零度是热力学上的最低温",
    "绝对真空在实验室中极难达成",
    "绝对优势理论由亚当斯密提出",
    "绝对真理与相对真理相辅相成",
    "绝对不轻言放弃是创业者的基本品质",
    "并非绝对不可实现只要找对方法",
    "最高气温预计出现在午后两点",
    "珠峰是世界最高峰",
    "最高人民法院发布了最新司法解释",
    "最高限额设定在五万元",
    "国家级非遗项目传承人手艺精湛",
    "国家级自然保护区生态环境优美",
    "顶级域名是DNS树状结构的最顶层",
    "该方程有且仅有唯一解",
    "备考需要付出100%的努力",
    "微信读书上的书友笔记很有深度"
  ];

  let legitimatePassed = 0;
  for (const text of legitimateCorpus) {
    const t1 = checkTier1Legality(text);
    const t2 = checkTier2PlatformRules(text);
    if (t1.passed && t2.passed) {
      legitimatePassed++;
    } else {
      console.log(`[Safe Pass Failed]: "${text}" -> t1: ${t1.violations}, t2: ${t2.violations}`);
    }
  }

  const safePassRate = legitimatePassed / legitimateCorpus.length;
  assert.ok(safePassRate >= 0.98, `Safe pass rate must be >= 98%, got ${(safePassRate * 100).toFixed(1)}%`);

  // Mixed sentences: legitimate token disguised with toxic payload -> MUST BE INTERCEPTED
  const disguisedPayloads = [
    { text: "第一步是添加我微信获取内部VIP资料", mustBlock: "微信" },
    { text: "计算绝对值的编程干货，稳赚不赔零风险投资", mustBlock: "稳赚不赔" },
    { text: "这是论文第一作者的绝密成果，包治百病彻底根治", mustBlock: "包治百病" },
    { text: "了解顶级域名原理，加V私信领免费源码", mustBlock: "加V" },
    { text: "在微信读书上读到天下第一泉，扫码支付立即购买", mustBlock: "扫码支付" },
    { text: "今天最高气温35度，兼职刷单日赚千元避暑指南", mustBlock: "兼职刷单" }
  ];

  let disguisedIntercepted = 0;
  for (const item of disguisedPayloads) {
    const t1 = checkTier1Legality(item.text);
    const t2 = checkTier2PlatformRules(item.text);
    const blocked = !t1.passed || !t2.passed;
    if (blocked) disguisedIntercepted++;
    assert.equal(blocked, true, `Disguised payload must be intercepted: "${item.text}"`);
  }
  assert.equal(disguisedIntercepted, disguisedPayloads.length);
});

// ============================================================================
// SECTION 2: CIRCADIAN SCHEDULER & BIOJITTER ADVERSARIAL STRESS TESTS
// ============================================================================

test("Adversarial 2.1: Quiet Hours (23:30 ~ 08:30) Minute-by-Minute Boundary Clamping", () => {
  // Test 1-minute resolution transitions around boundaries
  const boundaryPoints = [
    // Pre-quiet hour boundary (23:29:59) -> NOT quiet hours, but outside active traffic window
    { date: createDate(23, 29, 59), expectQuiet: false, expectAllowed: false, expectReason: "outside_active_window" },
    // Exact quiet start (23:30:00) -> QUIET HOURS! Suspended!
    { date: createDate(23, 30, 0), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // 1 second into quiet (23:30:01) -> QUIET HOURS!
    { date: createDate(23, 30, 1), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // Midnight (00:00:00) -> QUIET HOURS!
    { date: createDate(0, 0, 0), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // Deep night (03:15:00) -> QUIET HOURS!
    { date: createDate(3, 15, 0), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // Morning near end of quiet (08:29:59) -> QUIET HOURS!
    { date: createDate(8, 29, 59), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // Exact quiet end (08:30:00) -> QUIET HOURS boundary!
    { date: createDate(8, 30, 0), expectQuiet: true, expectAllowed: false, expectReason: "night_silence" },
    // 1 second past quiet (08:30:01) -> NOT quiet hours, but not yet lunch window
    { date: createDate(8, 30, 1), expectQuiet: false, expectAllowed: false, expectReason: "outside_active_window" },
    // 08:31:00 -> NOT quiet hours
    { date: createDate(8, 31, 0), expectQuiet: false, expectAllowed: false, expectReason: "outside_active_window" }
  ];

  for (const pt of boundaryPoints) {
    const res = evaluateCircadianWindow(pt.date);
    assert.equal(res.isQuietHours, pt.expectQuiet, `Failed quiet check at ${pt.date.toISOString()}`);
    assert.equal(res.allowed, pt.expectAllowed, `Failed allowed check at ${pt.date.toISOString()}`);
    assert.equal(res.reason, pt.expectReason, `Failed reason check at ${pt.date.toISOString()}`);
    assert.equal(res.suspended, pt.expectQuiet, `Suspended state must match quiet hours at ${pt.date.toISOString()}`);
  }
});

test("Adversarial 2.2: Active Traffic Windows Boundary Transitions", () => {
  const activeWindowTransitions = [
    // Lunch window (11:30:00 ~ 13:30:00)
    { date: createDate(11, 29, 59), expectAllowed: false, windowName: null },
    { date: createDate(11, 30, 0), expectAllowed: true, windowName: "lunch" },
    { date: createDate(12, 30, 0), expectAllowed: true, windowName: "lunch" },
    { date: createDate(13, 30, 0), expectAllowed: true, windowName: "lunch" },
    { date: createDate(13, 30, 1), expectAllowed: false, windowName: null },

    // Afternoon gap (13:30:01 ~ 17:59:59)
    { date: createDate(15, 0, 0), expectAllowed: false, windowName: null },

    // Evening prime-time window (18:00:00 ~ 20:30:00)
    { date: createDate(17, 59, 59), expectAllowed: false, windowName: null },
    { date: createDate(18, 0, 0), expectAllowed: true, windowName: "evening_prime" },
    { date: createDate(20, 0, 0), expectAllowed: true, windowName: "evening_prime" },
    { date: createDate(20, 30, 0), expectAllowed: true, windowName: "evening_prime" },
    { date: createDate(20, 30, 1), expectAllowed: false, windowName: null }
  ];

  for (const tr of activeWindowTransitions) {
    const res = evaluateCircadianWindow(tr.date);
    assert.equal(res.allowed, tr.expectAllowed, `Active window check failed at ${tr.date.toISOString()}`);
    assert.equal(res.windowName, tr.windowName, `Window name mismatch at ${tr.date.toISOString()}`);
  }
});

test("Adversarial 2.3: BioJitter Cannot Escape Active Windows (Monte Carlo & Worst-Case Invariant)", () => {
  // Case 1: Target near evening window closing (20:25). Jitter +35 min would land on 21:00 (outside window)
  const eveningClose = createDate(20, 25, 0);
  const jitterEveningClose = calculateBioJitter(eveningClose, { jitterMinutes: 35, clampToWindow: true });
  assert.equal(jitterEveningClose.clamped, true);
  assert.equal(jitterEveningClose.scheduledTime.getHours(), 20);
  assert.equal(jitterEveningClose.scheduledTime.getMinutes(), 30);
  assert.equal(jitterEveningClose.scheduledTime.getSeconds(), 0);

  // Case 2: Target at exact evening window opening (18:00). Jitter -35 min would land on 17:25 (outside window)
  const eveningOpen = createDate(18, 0, 0);
  const jitterEveningOpen = calculateBioJitter(eveningOpen, { jitterMinutes: -35, clampToWindow: true });
  assert.equal(jitterEveningOpen.clamped, true);
  assert.equal(jitterEveningOpen.scheduledTime.getHours(), 18);
  assert.equal(jitterEveningOpen.scheduledTime.getMinutes(), 0);

  // Case 3: Target at exact lunch window opening (11:30). Jitter -30 min would land on 11:00
  const lunchOpen = createDate(11, 30, 0);
  const jitterLunchOpen = calculateBioJitter(lunchOpen, { jitterMinutes: -30, clampToWindow: true });
  assert.equal(jitterLunchOpen.clamped, true);
  assert.equal(jitterLunchOpen.scheduledTime.getHours(), 11);
  assert.equal(jitterLunchOpen.scheduledTime.getMinutes(), 30);

  // Case 4: Target near lunch window close (13:28). Jitter +25 min would land on 13:53
  const lunchClose = createDate(13, 28, 0);
  const jitterLunchClose = calculateBioJitter(lunchClose, { jitterMinutes: 25, clampToWindow: true });
  assert.equal(jitterLunchClose.clamped, true);
  assert.equal(jitterLunchClose.scheduledTime.getHours(), 13);
  assert.equal(jitterLunchClose.scheduledTime.getMinutes(), 30);

  // Monte Carlo Stress Test: 1,000 random jitter calculations across lunch and evening windows
  const testBaseDates = [
    createDate(11, 30, 0),
    createDate(11, 45, 0),
    createDate(12, 30, 0),
    createDate(13, 15, 0),
    createDate(13, 30, 0),
    createDate(18, 0, 0),
    createDate(18, 15, 0),
    createDate(19, 30, 0),
    createDate(20, 15, 0),
    createDate(20, 30, 0)
  ];

  for (const baseDate of testBaseDates) {
    for (let i = 0; i < 100; i++) {
      const res = calculateBioJitter(baseDate, { clampToWindow: true });
      const sched = res.scheduledTime;
      const schedMin = sched.getHours() * 60 + sched.getMinutes();

      // Scheduled time MUST strictly fall within [11:30..13:30] or [18:00..20:30]
      const inLunch = schedMin >= (11 * 60 + 30) && schedMin <= (13 * 60 + 30);
      const inEvening = schedMin >= (18 * 60 + 0) && schedMin <= (20 * 60 + 30);

      assert.ok(inLunch || inEvening, `BioJitter scheduledTime leaked outside active windows: ${sched.toISOString()}`);
    }
  }
});

test("Adversarial 2.4: Quiet Hours Queue Leakage Prevention & Suspension Invariant", async () => {
  const queuePath = createTempFile("queue-leak-test-");
  try {
    // Populate queue with past-due and ready items
    enqueueQueueItem(
      {
        id: "item_due_yesterday",
        scheduledTime: createDate(20, 0, 0, -1).toISOString(),
        title: "Overdue note",
        gateMode: "auto",
        compliancePassed: true
      },
      { queuePath }
    );

    enqueueQueueItem(
      {
        id: "item_due_morning",
        scheduledTime: createDate(12, 0, 0, -1).toISOString(),
        title: "Old lunch note",
        gateMode: "auto",
        compliancePassed: true
      },
      { queuePath }
    );

    let publishedCount = 0;
    const publishCallback = async () => {
      publishedCount++;
    };

    // Attempt 1: Process queue at 23:45 (inside quiet hours)
    const run1 = await processPublishQueue({
      queuePath,
      gateMode: "auto",
      now: createDate(23, 45, 0),
      onPublishCallback: publishCallback
    });

    assert.equal(run1.suspended, true, "Execution must be suspended during quiet hours");
    assert.equal(run1.reason, "night_silence");
    assert.equal(run1.released.length, 0, "No items may be released during quiet hours");
    assert.equal(publishedCount, 0, "Publish callback must not be invoked during quiet hours");

    // Attempt 2: Process queue at 03:00 AM (deep night quiet hours)
    const run2 = await processPublishQueue({
      queuePath,
      gateMode: "auto",
      now: createDate(3, 0, 0),
      onPublishCallback: publishCallback
    });

    assert.equal(run2.suspended, true);
    assert.equal(run2.released.length, 0);
    assert.equal(publishedCount, 0);

    // Attempt 3: Process queue at 08:29:59 AM (quiet hours boundary)
    const run3 = await processPublishQueue({
      queuePath,
      gateMode: "auto",
      now: createDate(8, 29, 59),
      onPublishCallback: publishCallback
    });

    assert.equal(run3.suspended, true);
    assert.equal(run3.released.length, 0);
    assert.equal(publishedCount, 0);
  } finally {
    try {
      fs.rmSync(path.dirname(queuePath), { recursive: true, force: true });
    } catch {}
  }
});

test("Adversarial 2.5: Manual Buffer Gate Leakage Prevention Under Concurrent/Auto Ingestion", async () => {
  const queuePath = createTempFile("queue-buffer-leak-");
  try {
    const activeTime = createDate(19, 0, 0); // Active evening prime slot

    // Item 1: Gate mode is manual_buffer, past due
    enqueueQueueItem(
      {
        id: "manual_item_1",
        scheduledTime: createDate(18, 30, 0).toISOString(),
        title: "Manual Buffer Candidate 1",
        gateMode: "manual_buffer",
        compliancePassed: true
      },
      { queuePath }
    );

    // Item 2: Gate mode is manual_buffer, unapproved
    enqueueQueueItem(
      {
        id: "manual_item_2",
        scheduledTime: createDate(18, 45, 0).toISOString(),
        title: "Manual Buffer Candidate 2",
        gateMode: "manual_buffer",
        compliancePassed: true
      },
      { queuePath }
    );

    // Run processor in 'auto' mode — manual_buffer items MUST NOT leak through!
    let publishedIds = [];
    const autoRun = await processPublishQueue({
      queuePath,
      gateMode: "auto",
      now: activeTime,
      onPublishCallback: async (item) => {
        publishedIds.push(item.id);
      }
    });

    assert.equal(autoRun.released.length, 0, "Manual buffer items must never leak in auto processor run");
    assert.equal(autoRun.buffered.length, 2, "Both manual items must be safely held in buffer");
    assert.deepEqual(publishedIds, []);

    // Verify queue status on disk
    const q1 = loadSchedulerQueue(queuePath);
    for (const item of q1) {
      assert.equal(item.status, "awaiting_manual_approval");
      assert.equal(item.founderApproved, false);
      assert.equal(item.released, false);
    }

    // Now founder explicitly releases item 1
    const releaseRes = releaseQueueItem("manual_item_1", { queuePath });
    assert.equal(releaseRes.success, true);
    assert.equal(releaseRes.item.status, "ready_to_publish");
    assert.equal(releaseRes.item.founderApproved, true);

    // Run processor again — only released item 1 should publish, item 2 must stay buffered!
    const runAfterRelease = await processPublishQueue({
      queuePath,
      gateMode: "auto",
      now: activeTime,
      onPublishCallback: async (item) => {
        publishedIds.push(item.id);
      }
    });

    assert.equal(runAfterRelease.released.length, 1, "Only approved item 1 should be released");
    assert.equal(runAfterRelease.released[0].id, "manual_item_1");
    assert.equal(runAfterRelease.buffered.length, 1, "Unapproved item 2 must remain buffered");
    assert.equal(runAfterRelease.buffered[0].id, "manual_item_2");
    assert.deepEqual(publishedIds, ["manual_item_1"]);
  } finally {
    try {
      fs.rmSync(path.dirname(queuePath), { recursive: true, force: true });
    } catch {}
  }
});

test("Adversarial 2.6: Corrupted, Truncated & Malformed Queue Recovery", async () => {
  const queuePath = createTempFile("queue-corrupt-");
  try {
    // 1. Truncated JSON
    fs.writeFileSync(queuePath, '[\n  { "id": "broken", "title": "trunc', "utf8");
    const loaded1 = loadSchedulerQueue(queuePath);
    assert.deepEqual(loaded1, [], "Truncated JSON queue should gracefully return empty array");

    const runCorrupt1 = await processPublishQueue({ queuePath, now: createDate(19, 0, 0) });
    assert.deepEqual(runCorrupt1.released, []);
    assert.deepEqual(runCorrupt1.buffered, []);

    // 2. Empty string
    fs.writeFileSync(queuePath, "   \n\t  ", "utf8");
    const loaded2 = loadSchedulerQueue(queuePath);
    assert.deepEqual(loaded2, []);

    // 3. Object instead of array
    fs.writeFileSync(queuePath, JSON.stringify({ error: "not an array" }), "utf8");
    const loaded3 = loadSchedulerQueue(queuePath);
    assert.deepEqual(loaded3, []);

    // 4. Non-existent file
    const nonExistentPath = path.join(os.tmpdir(), `non_existent_${Date.now()}.json`);
    const loaded4 = loadSchedulerQueue(nonExistentPath);
    assert.deepEqual(loaded4, []);
  } finally {
    try {
      fs.rmSync(path.dirname(queuePath), { recursive: true, force: true });
    } catch {}
  }
});
