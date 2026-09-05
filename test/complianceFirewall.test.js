import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  evaluateCompliance,
  checkTier1Legality,
  checkTier2PlatformRules,
  filterContextualSafePass,
  recordAuditLog,
  normalizeText
} from "../src/autonomous_content/complianceFirewall.js";

// Helper: disposable audit log path in OS temp dir
function createTempAuditPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compliance-test-"));
  return path.join(dir, "audit_log.jsonl");
}

test("normalizeText converts fullwidth and removes zero-width characters", () => {
  const input = "第\u200B一\uFEFF，加Ｖ，ｖｘ！";
  const norm = normalizeText(input);
  assert.equal(norm.includes("\u200B"), false);
  assert.equal(norm.includes("\uFEFF"), false);
  assert.equal(norm.includes("加V"), true);
  assert.equal(norm.includes("vx"), true);
});

test("checkTier1Legality: 100% intercept on Chinese Advertising Law superlatives and red lines", () => {
  const samples = [
    { text: "这是一款绝对有效的产品", expectedKw: "绝对" },
    { text: "我们是全行业排名第一的团队", expectedKw: "第一" },
    { text: "国家级认证配方，填补国内空白", expectedKw: "国家级" },
    { text: "最高品质，最顶级配置", expectedKw: "最高" },
    { text: "全网首发独家首发最新玩法", expectedKw: "全网首发" },
    { text: "极品好物，错过等一年", expectedKw: "极品" },
    { text: "纯中药配方，100%有效包治百病", expectedKw: "包治百病" },
    { text: "手把手教你稳赚不赔，零风险投资", expectedKw: "稳赚不赔" },
    { text: "中南海特供好茶", expectedKw: "特供" },
    { text: "地下钱庄洗钱，高利贷快速放款", expectedKw: "高利贷" }
  ];

  let intercepted = 0;
  for (const sample of samples) {
    const result = checkTier1Legality(sample.text);
    assert.equal(result.passed, false, `Failed to intercept: ${sample.text}`);
    assert.equal(result.violations.length > 0, true);
    intercepted++;
  }

  assert.equal(intercepted, samples.length, "Must achieve 100% intercept on Tier 1 violations");
});

test("checkTier1Legality: 100% intercept on evasion disguises (punctuation, spaces, symbols)", () => {
  const evasions = [
    "第.一",
    "第_一",
    "第-一",
    "第 一",
    "绝·对",
    "绝~对",
    "顶_级",
    "极*品",
    "国*家*级",
    "稳.赚.不.赔",
    "零 风 险",
    "100% 有效",
    "包·治·百·病"
  ];

  for (const text of evasions) {
    const res = checkTier1Legality(text);
    assert.equal(res.passed, false, `Disguise evaded detection: "${text}"`);
    assert.equal(res.violations.length > 0, true);
  }
});

test("checkTier2PlatformRules: 100% intercept on illegal traffic diversion and blackhat jobs", () => {
  const diversions = [
    { text: "想领资料的直接加V交流", keyword: "加V" },
    { text: "我的微信是 abc123456", keyword: "微信" },
    { text: "私我vx领取高清原图", keyword: "vx" },
    { text: "感兴趣的直接私聊我发你", keyword: "私聊" },
    { text: "移步淘宝搜索店铺下单", keyword: "淘宝" },
    { text: "不支持平台交易，请私下转账", keyword: "转账" },
    { text: "招募兼职刷单，日赚千元不费力", keyword: "兼职刷单" },
    { text: "点击进群领取绝密清单", keyword: "进群" },
    { text: "看我主页背景有联系方式", keyword: "主页背景" }
  ];

  let intercepted = 0;
  for (const sample of diversions) {
    const res = checkTier2PlatformRules(sample.text);
    assert.equal(res.passed, false, `Failed to intercept diversion: ${sample.text}`);
    assert.equal(res.violations.length > 0, true);
    intercepted++;
  }

  assert.equal(intercepted, diversions.length, "Must achieve 100% intercept on Tier 2 diversions");
});

test("checkTier2PlatformRules: 100% intercept on homophones and disguised diversion", () => {
  const disguisedDiversions = [
    "加.V",
    "加-v",
    "加_v",
    "加微",
    "加薇",
    "加威",
    "v信",
    "V信",
    "微.信",
    "微-信",
    "v.x",
    "v-x",
    "私.聊",
    "私liao",
    "淘.宝",
    "某宝",
    "闲鱼",
    "某鱼",
    "进裙",
    "日.赚.千.元"
  ];

  for (const text of disguisedDiversions) {
    const res = checkTier2PlatformRules(text);
    assert.equal(res.passed, false, `Diversion disguise bypassed: "${text}"`);
    assert.equal(res.violations.length > 0, true);
  }
});

test("filterContextualSafePass: >=98% safe pass rate on normal contextual phrases", () => {
  const legitimateCorpus = [
    "第一步是明确你的目标受众与核心痛点",
    "求绝对值的数学运算是初中代数的基础概念",
    "济南的趵突泉被清代乾隆皇帝御封为天下第一泉",
    "这是我第一次尝试用结构化思维梳理读书笔记",
    "自媒体运营第一天，先从搭建选题库开始",
    "遇到突发舆情事件，品牌方应在第一时间给出客观说明",
    "面对负面反馈，普通人的第一反应通常是自我辩解",
    "我们先完成项目的第一阶段交付，再开启后续迭代",
    "今天分享第一章的核心论点与案例拆解",
    "请认真阅读用户协议的第一条规定",
    "今天北京的最高气温达到了32度",
    "珠穆朗玛峰是世界上最高峰，海拔超过八千米",
    "中华人民共和国最高人民法院发布了指导案例",
    "根据气象台播报，明天将迎来本周最高温",
    "古琴艺术是首批列入国家级非物质文化遗产的名录",
    "神农架国家级自然保护区拥有丰富的植被资源",
    "了解互联网域名解析原理，必须先认识顶级域名的架构",
    "只要在备考阶段付出100%的努力，就不会留下遗憾",
    "在代数几何中，这个线性方程组有且仅有唯一解",
    "在微信读书上读完了这本《认知觉醒》，收获很大",
    "分享一个好用的第一人称叙事写作模板",
    "第一宇宙速度是航天器进入环绕轨道所需的最小速度",
    "解决这个复杂商业难题，需要运用第一性原理",
    "我的第一志愿是计算机科学与技术专业",
    "这是团队的第一位签约作者",
    "绝对零度是热力学理论上的最低温度",
    "在编程中使用绝对路径可以避免相对位置解析错误",
    "有些音乐天才天生就拥有绝对音感",
    "我绝对不会因为一次失败而轻言放弃",
    "这件事情绝对没有表面上看起来那么简单",
    "并非绝对不可逾越，只要拆解目标就可以达成",
    "第一周打卡完成，阅读了三本商业经典",
    "第一篇小红书笔记复盘：如何挑选高吸引力选题",
    "第一手数据表明，用户更关注实用操作清单",
    "第一组对照实验得出了显著的统计学差异",
    "第一次演讲虽然紧张，但完整表达了核心观点",
    "第一课我们先学习如何写出吸引人的Hook开头",
    "天下第一关山海关地势险要，气势雄伟",
    "泰山被称为天下第一山，景色壮丽",
    "黄山是中国天下第一奇山，以奇松怪石闻名",
    "第一产业指农业、林业、畜牧业和渔业",
    "驻村第一书记带领全村探索特色产业致富",
    "绝对误差是测量值与真实值之间的差值",
    "在CSS布局中，绝对定位可以灵活定位卡片元素",
    "第一季度的复盘报告已经汇总完毕",
    "第一学历固然重要，但持续学习能力决定上限",
    "第一桶金的积累往往伴随着认知与认知的巨大飞跃",
    "最高人民检察院依法履行法律监督职责",
    "这个关卡的最高限额是五千积分",
    "国家级文物保护单位需要严格遵循修缮保护标准"
  ];

  let safePassedCount = 0;
  const total = legitimateCorpus.length;

  for (const sentence of legitimateCorpus) {
    const t1 = checkTier1Legality(sentence);
    const t2 = checkTier2PlatformRules(sentence);

    const passed = t1.passed && t2.passed;
    if (passed) {
      safePassedCount++;
    } else {
      assert.fail(`Legitimate sentence failed compliance firewall: "${sentence}". Violations: ${[...t1.violations, ...t2.violations].join("; ")}`);
    }
  }

  const passRate = safePassedCount / total;
  assert.equal(passRate >= 0.98, true, `Pass rate must be >= 98%, got ${passRate * 100}%`);
  assert.equal(safePassedCount, total, "Expected 100% safe pass on pure non-infringing corpus");
});

test("filterContextualSafePass: safe phrasing does not excuse accompanying advertising claims", () => {
  const mixedCases = [
    {
      text: "这是自媒体运营的第一步，因为我们的课程质量全网第一！",
      mustInterceptKeyword: "第一"
    },
    {
      text: "第一步是制定复习计划，使用本神药保你包治百病！",
      mustInterceptKeyword: "包治百病"
    },
    {
      text: "计算绝对值的编程教程，加我微信免费发你源码！",
      mustInterceptKeyword: "微信"
    },
    {
      text: "第一次投资理财，手把手带你稳赚不赔零风险！",
      mustInterceptKeyword: "稳赚不赔"
    }
  ];

  for (const item of mixedCases) {
    const t1 = checkTier1Legality(item.text);
    const t2 = checkTier2PlatformRules(item.text);
    const isIntercepted = !t1.passed || !t2.passed;

    assert.equal(isIntercepted, true, `Should intercept mixed case: "${item.text}"`);
  }
});

test("evaluateCompliance: handles clean content package cleanly", () => {
  const cleanPackage = {
    title: "深度思考的3个实用工具",
    body: "第一步是建立每日复盘清单。\n第二步是梳理核心指标。\n坚持记录可以让你思维更加清晰。",
    tags: ["#认知思维", "#个人成长", "#效率工具"],
    slides: [
      { title: "思维提升指南", content: "第一步：建立框架" },
      { title: "指标梳理", bullets: ["曝光量", "互动率", "完播率"] }
    ]
  };

  const result = evaluateCompliance(cleanPackage);
  assert.equal(result.passed, true);
  assert.equal(result.riskLevel, "clean");
  assert.equal(result.tier1Violations.length, 0);
  assert.equal(result.tier2Violations.length, 0);
  assert.equal(result.matchedKeywords.length, 0);
  assert.equal(result.auditRecord.passed, true);
  assert.equal(typeof result.auditRecord.contentHash, "string");
  assert.equal(result.auditRecord.contentHash.length, 64);
});

test("evaluateCompliance: multi-field detection (title, body, tags, slides)", () => {
  const violativePackage = {
    title: "全网第一的搞钱秘籍",
    body: "这是绝对有效的暴富指南，教你稳赚不赔零风险。",
    tags: ["#搞钱", "#加V私聊"],
    slides: [
      { title: "第一步：认知突破", content: "正常的分析内容" },
      { title: "卡片2", content: "想学的私聊我微信领全套资料" }
    ]
  };

  const result = evaluateCompliance(violativePackage);
  assert.equal(result.passed, false);
  assert.equal(result.riskLevel, "blocked");
  assert.equal(result.tier1Violations.length >= 2, true);
  assert.equal(result.tier2Violations.length >= 2, true);

  // Suggestions should offer actionable advice
  assert.equal(result.suggestions.length > 0, true);
  assert.equal(result.suggestions.some((s) => s.includes("极限词") || s.includes("广告法")), true);
  assert.equal(result.suggestions.some((s) => s.includes("私域导流") || s.includes("微信")), true);
});

test("recordAuditLog: writes structured JSONL audit trail correctly", () => {
  const tempAuditPath = createTempAuditPath();

  const auditRecord = {
    id: "audit_test_12345",
    timestamp: new Date().toISOString(),
    contentHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    title: "测试合规审核",
    passed: false,
    riskLevel: "blocked",
    tier1Violations: ["[标题] 广告法极限词: 第一"],
    tier2Violations: ["[正文] 违规导流: 加V"],
    matchedKeywords: ["第一", "加V"],
    suggestions: ["请修改极限词", "请删除联系方式"],
    stats: { charCount: 120, tier1Count: 1, tier2Count: 1, totalViolations: 2 }
  };

  const res = recordAuditLog(auditRecord, { auditPath: tempAuditPath });
  assert.equal(res.logged, true);
  assert.equal(res.auditPath, tempAuditPath);

  // Verify file on disk
  assert.equal(fs.existsSync(tempAuditPath), true);
  const content = fs.readFileSync(tempAuditPath, "utf8").trim();
  const parsed = JSON.parse(content);

  assert.equal(parsed.id, "audit_test_12345");
  assert.equal(parsed.passed, false);
  assert.equal(parsed.riskLevel, "blocked");
  assert.deepEqual(parsed.matchedKeywords, ["第一", "加V"]);

  // Test append second record
  const secondRecord = { ...auditRecord, id: "audit_test_67890", passed: true, riskLevel: "clean" };
  recordAuditLog(secondRecord, { auditPath: tempAuditPath });

  const lines = fs.readFileSync(tempAuditPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const secondParsed = JSON.parse(lines[1]);
  assert.equal(secondParsed.id, "audit_test_67890");
  assert.equal(secondParsed.passed, true);
});

test("recordAuditLog: handles invalid input safely", () => {
  const res = recordAuditLog(null);
  assert.equal(res.logged, false);
  assert.equal(typeof res.error, "string");
});
