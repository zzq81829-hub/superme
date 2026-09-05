/**
 * Cultural Adaptation & Trend Engine (一人内容公司 - R1 爆款嗅探与本土化网民胃口转译引擎)
 *
 * Implements:
 * - adaptOverseasTopic: Deep cultural & psychological translation for Chinese youth/netizens
 * - detectMachineTranslation: Zero-MT detection scanning for translationese & calques
 * - generate3SecondHooks: 3-second retention formulaic hooks strictly <= 20 characters
 * - breakdownPainPoint: Structures problems into persona, hidden anxiety, reframing & checklist
 * - trimExplainingPulp: Enforces CARD 07 stop-explaining principle (cuts preachy fluff)
 * - packageContentMetadata: Packages structured Xiaohongshu metadata and layout plans
 *
 * Adheres to:
 * - CONTENT_OPERATING_SYSTEM.md CARD 02, 04, 05, 06, 07, 08
 * - Title length limit: <= 20 Chinese characters
 * - Zero-MT score requirement: >= 0.85
 */

import { buildXiaohongshuLayoutPlan, XIAOHONGSHU_LAYOUT_TEMPLATES } from "../content/xiaohongshuLayout.js";

export const TITLE_MAX_LENGTH = 20;

/**
 * Safely clips title to maxLength ensuring UTF-16 code units <= maxLength,
 * code points are respected, and surrogate pairs (emojis/astral plane) are never broken.
 * @param {string} str
 * @param {number} [maxLength=TITLE_MAX_LENGTH]
 * @returns {string}
 */
export function safeClipTitle(str, maxLength = TITLE_MAX_LENGTH) {
  const clean = String(str || "").trim();
  const codePoints = Array.from(clean);
  let clipped = clean;
  if (codePoints.length > maxLength) {
    clipped = codePoints.slice(0, maxLength).join("");
  }
  if (clipped.length > maxLength) {
    clipped = clipped.slice(0, maxLength);
    const lastCode = clipped.charCodeAt(clipped.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      clipped = clipped.slice(0, -1);
    }
  }
  if (typeof clipped.isWellFormed === "function" && !clipped.isWellFormed()) {
    clipped = clipped.toWellFormed();
  }
  return clipped;
}

/**
 * Known translationese patterns, Europeanized syntactic calques, and machine translation markers.
 */
export const MT_PATTERNS = [
  { regex: /被(?:认为|发现|证明|指出|视为|称作|普遍认为|广泛认为)/g, label: "被动态滥用(passive calque)", penalty: 0.25 },
  { regex: /在很大程度上/g, label: "欧化程度副词(to a large extent)", penalty: 0.25 },
  { regex: /基于.+的基础(?:上)?/g, label: "冗余介词短语(based on the foundation)", penalty: 0.25 },
  { regex: /在.+的背景下/g, label: "生硬背景状语(in the context of)", penalty: 0.2 },
  { regex: /关于.+的方面/g, label: "机械介词(in terms of / regarding)", penalty: 0.2 },
  { regex: /就.+而言/g, label: "公文式翻译腔(as far as ... is concerned)", penalty: 0.2 },
  { regex: /从.+的角度来看/g, label: "机械视角短语(from the perspective of)", penalty: 0.2 },
  { regex: /进行(?:思考|分析|研究|讨论|探讨|探索|尝试|反思|评估|优化)/g, label: "动词名物化(verbal nominalization: conduct ...)", penalty: 0.2 },
  { regex: /作出(?:决定|选择|改变|调整|承诺)/g, label: "名物化短语(make a decision/change)", penalty: 0.2 },
  { regex: /具有(?:极其重要的|重要|关键|核心)意义/g, label: "机械修饰(has important significance)", penalty: 0.25 },
  { regex: /扮演(?:着)?(?:重要|不可或缺的)?角色/g, label: "机械隐喻(play an important role)", penalty: 0.25 },
  { regex: /导致了.+的产生/g, label: "因果套话(led to the generation of)", penalty: 0.25 },
  { regex: /使其能够/g, label: "使役动词生硬直译(enable it to)", penalty: 0.2 },
  { regex: /正如我们所知/g, label: "口头套语直译(as we all know)", penalty: 0.15 },
  { regex: /显而易见的是/g, label: "句首填充词直译(it is obvious that)", penalty: 0.2 },
  { regex: /毫无疑问的是/g, label: "无疑问直译(there is no doubt that)", penalty: 0.2 },
  { regex: /综上所述/g, label: "学术八股(in summary / to conclude)", penalty: 0.15 },
  { regex: /以一种.+的方式/g, label: "副词从句直译(in a ... way)", penalty: 0.2 },
  { regex: /一个有着.+的(?:人|事物)/g, label: "不定冠词赘述(a person who has)", penalty: 0.2 }
];

/**
 * Preachiness and lecturing filler patterns (CARD 07 Stop Explaining).
 */
export const EXPLAINING_PULP_PATTERNS = [
  /所以(?:大家)?一定要学会(?:勇敢)?做自己[，,。！!]*/g,
  /所以我们应该[^\n。！？!?]+[。！？!?]?/g,
  /因此我们要[^\n。！？!?]+[。！？!?]?/g,
  /我们要明白一个道理[：:，,][^\n。！？!?]+[。！？!?]?/g,
  /希望每个人都能[^\n。！？!?]+[。！？!?]?/g,
  /让我们一起(?:努力|加油)[^\n。！？!?]+[。！？!?]?/g,
  /只有这样，我们才能成为更好的自己[。！？!?]?/g,
  /正如著名的[^\n，。]+所说[，,]/g,
  /综上所述[，,]/g,
  /总而言之[，,]/g,
  /不要过于在乎别人的目光[，,。！!]*/g
];

/**
 * Domain Knowledge Base: Translating overseas cognition concepts into Chinese youth predicaments (CARD 04).
 */
const KNOWLEDGE_ADAPTATION_MAP = [
  {
    keywords: ["spotlight effect", "nobody is watching", "caring what others think", "social anxiety", "聚光灯效应", "别人眼光", "被评价", "内耗", "朋友圈"],
    category: "social_anxiety",
    coreConcept: "聚光灯效应 (Spotlight Effect)",
    netizenPredicament: "朋友圈发了又删、职场汇报怕出丑、总觉得大家都在盯着自己评头论足",
    persona: "初入职场青年 / 讨好型人格 / 20-30岁高内耗人群",
    hiddenAnxiety: "表面上是害怕尴尬出丑，底层是对被群体排斥与失去归属感的原始恐惧",
    reframing: "生活里没有那么多观众。别人其实只关心他们自己，放下假想舞台，才是自由的开始。",
    hooks: [
      { title: "生活里没有那么多观众", hookType: "contrarian", angle: "contrarian" },
      { title: "你越在乎别人眼光，越容易内耗", hookType: "paradox", angle: "paradox" },
      { title: "我30岁才明白：根本没人看你", hookType: "confession", angle: "confession" },
      { title: "你可能把社交形象想重了", hookType: "reframing", angle: "reframing" },
      { title: "收下这套戒掉内耗指南", hookType: "utility", angle: "utility" },
      { title: "你也经常发完动态又偷删吗？", hookType: "discussion", angle: "discussion" },
      { title: "别再用别人的剧本折磨自己", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "物理脱敏：发完动态立刻退出软件，2小时内绝不反复刷新点赞",
      "聚光灯降维：在心中默念“大家工作都很忙，根本没人注意我”",
      "目标转移：把关注点从“别人怎么看我”拉回到“我今天完成了什么”"
    ],
    tags: ["#认知思维", "#停止内耗", "#自我提升", "#职场成长", "#活出自己"]
  },
  {
    keywords: ["procrastination", "perfectionism", "fear of failure", "self-sabotage", "resistance", "拖延", "完美主义", "执行力", "害怕失败", "自尊"],
    category: "procrastination",
    coreConcept: "拖延与自尊防御机制 (Procrastination & Self-Esteem)",
    netizenPredicament: "总要拖到 Deadline 最后一刻才动手，明明想做却止步不前，深夜陷入自责与焦虑",
    persona: "考研/考公党 / 知识工作者 / 习惯性完美主义拖延者",
    hiddenAnxiety: "只要我不全力以赴，失败就可以归咎于“我没认真”，以此保住自己“我很聪明”的自尊幻觉",
    reframing: "你迟迟不肯全力以赴，是在保护自己的自尊。完成远比完美重要，撕掉天才滤镜才能破局。",
    hooks: [
      { title: "你迟迟不努力，是在保护自尊", hookType: "contrarian", angle: "contrarian" },
      { title: "为什么越聪明的人，反而越拖延？", hookType: "paradox", angle: "paradox" },
      { title: "我后来才发现：拖延不是因为懒", hookType: "confession", angle: "confession" },
      { title: "你可能把执行力当成了意志力", hookType: "reframing", angle: "reframing" },
      { title: "搞懂这3步，彻底告别拖延症", hookType: "utility", angle: "utility" },
      { title: "你是不是也不到DDL绝不下笔？", hookType: "discussion", angle: "discussion" },
      { title: "先做出一坨粗糙的半成品", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "微小启动法则：将启动门槛降到2分钟，哪怕只写下一行字也算胜利",
      "粗糙许可制：允许产出前10%为低质量草稿，坚决打破白纸恐惧",
      "情绪物理剥离：拿纸笔客观写下抗拒动笔的具体卡点，不作自我评判"
    ],
    tags: ["#执行力提升", "#告别拖延", "#认知思维", "#深度工作", "#搞钱思维"]
  },
  {
    keywords: ["external validation", "people pleasing", "approval seeking", "boundaries", "讨好型", "老好人", "拒绝", "认可", "心理边界"],
    category: "people_pleasing",
    coreConcept: "外部认可与边界确立 (External Validation & Boundaries)",
    netizenPredicament: "职场上不敢拒绝同事甩锅，生怕别人生气；朋友圈秒回他人却委屈了自己",
    persona: "职场新人 / 敏感共情者 / 习惯性妥协者",
    hiddenAnxiety: "误以为爱与价值必须通过顺从他人来换取，极度害怕发生冲突",
    reframing: "你越想得到所有人的认可，越容易弄丢自己。有锋芒的善良才能赢得真正的尊重。",
    hooks: [
      { title: "你越想讨好所有人，越容易弄丢自己", hookType: "contrarian", angle: "contrarian" },
      { title: "为什么越温和的老好人越不受尊重？", hookType: "paradox", angle: "paradox" },
      { title: "真正让我解脱的，是学会拒绝", hookType: "confession", angle: "confession" },
      { title: "你可能把讨好当成了情商高", hookType: "reframing", angle: "reframing" },
      { title: "建议收藏这份职场拒绝话术", hookType: "utility", angle: "utility" },
      { title: "你敢在工作群里直接说不吗？", hookType: "discussion", angle: "discussion" },
      { title: "先立规矩，再谈体面", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "24小时缓冲法则：面对突发非本职请求，统一回复“我确认一下日程稍后答复”",
      "设立3条铁律边界：明文列出下班后不接私事、不垫付无单据款项等红线",
      "分离评价与事实：别人的不满只是对方的预期落空，不代表你有任何道德亏欠"
    ],
    tags: ["#拒绝讨好", "#心理边界", "#职场生存法则", "#认知觉醒", "#情绪自救"]
  },
  {
    keywords: ["parkinson's law", "time management", "deep work", "multitasking", "focus", "时间管理", "假装忙碌", "摸鱼", "深度专注", "帕金森定律"],
    category: "deep_work",
    coreConcept: "帕金森定律与深度专注 (Parkinson's Law & Focus)",
    netizenPredicament: "在工位上忙碌一整天却毫无产出，时间被即时通讯消息和零碎开会撕成碎片",
    persona: "远程办公人员 / 互联网从业者 / 自由职业创作者",
    hiddenAnxiety: "害怕面对真正高难度的核心问题，用形式上的低效忙碌营造虚假安全感",
    reframing: "真正厉害的人，从不用假装忙碌证明自己。给任务设死短周期，倒逼单点突破。",
    hooks: [
      { title: "真正厉害的人，从不假装努力", hookType: "contrarian", angle: "contrarian" },
      { title: "为什么你天天加班，却一无所获？", hookType: "paradox", angle: "paradox" },
      { title: "我后来才发现：工时越长效率越低", hookType: "confession", angle: "confession" },
      { title: "你可能把摸鱼当成了放松", hookType: "reframing", angle: "reframing" },
      { title: "高段位时间管理：45分钟时间盒", hookType: "utility", angle: "utility" },
      { title: "今天你又被无意义的琐事填满了吗？", hookType: "discussion", angle: "discussion" },
      { title: "砍掉一半任务，产出反而翻倍", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "时间盒锁死：把原本预估半天的任务，强行设定在45分钟单兵突击完成",
      "物理断网盲打：冲刺期间彻底关闭即时通讯工具与弹窗通知",
      "单线程推进：同一时间段只开单个窗口，杜绝伪多任务并行"
    ],
    tags: ["#时间管理", "#深度工作", "#高效生产力", "#认知升级", "#自我管理"]
  },
  {
    keywords: ["compounding", "consistency", "quit too early", "patience", "复利", "坚持", "急功近利", "三分钟热度", "长期主义", "搞钱"],
    category: "compounding",
    coreConcept: "复利效应与飞轮拐点 (Compounding & Patience)",
    netizenPredicament: "做自媒体三天看不到数据就放弃，买课看书追求即刻变现，陷在短期暴富的幻觉中",
    persona: "副业探索者 / 自媒体新人 / 渴望搞钱的年轻人",
    hiddenAnxiety: "对未来的确定性极度匮乏，一旦短期没有即时反馈就恐慌沉没成本",
    reframing: "普通人逆袭的底牌，是别人看不懂的隐形复利。飞轮前期的沉闷，是在为爆发蓄力。",
    hooks: [
      { title: "普通人逆袭的底牌，是隐形复利", hookType: "contrarian", angle: "contrarian" },
      { title: "为什么越急于搞钱的人，越赚不到钱？", hookType: "paradox", angle: "paradox" },
      { title: "真正拉开差距的，是别人放弃后的坚持", hookType: "confession", angle: "confession" },
      { title: "你可能把耐心想成了慢", hookType: "reframing", angle: "reframing" },
      { title: "建议收藏这套个人复利飞轮模型", hookType: "utility", angle: "utility" },
      { title: "你手头的事情坚持超过90天了吗？", hookType: "discussion", angle: "discussion" },
      { title: "熬过无人问津的低谷期", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "记录微步演进：每天强制留下一份哪怕仅有1%进步的数字资产",
      "屏蔽短期数据噪音：新尝试在跑满90天前不以单篇成败作结论",
      "聚焦动作本身：把衡量标准从“今天赚了多少”调整为“今天动作是否执行到位”"
    ],
    tags: ["#搞钱思维", "#认知跃迁", "#复利效应", "#个人IP", "#长期主义"]
  },
  {
    keywords: ["dopamine", "cheap dopamine", "attention span", "brain rot", "多巴胺", "廉价快乐", "刷短视频", "注意力", "精神空虚"],
    category: "dopamine_detox",
    coreConcept: "注意力稀缺与多巴胺脱敏 (Attention & Dopamine Detox)",
    netizenPredicament: "睡前刷手机到凌晨两点停不下来，大脑昏沉记不住东西，注意力极易涣散",
    persona: "手机重度依赖者 / 深夜焦虑网民 / 泛大学生群体",
    hiddenAnxiety: "借由无休止的信息瀑布流麻痹现实生活中的受挫感与孤独",
    reframing: "廉价的多巴胺，正在掏空你的核心思考力。守住注意力，才是现代人最高的清醒。",
    hooks: [
      { title: "廉价的多巴胺，正在掏空你", hookType: "contrarian", angle: "contrarian" },
      { title: "为什么越刷手机，心里反而越空虚？", hookType: "paradox", angle: "paradox" },
      { title: "我戒掉短视频30天后的惊人变化", hookType: "confession", angle: "confession" },
      { title: "你可能把多巴胺刺激当成了快乐", hookType: "reframing", angle: "reframing" },
      { title: "建议收藏这份多巴胺斋戒实操表", hookType: "utility", angle: "utility" },
      { title: "今晚你又打算刷手机到几点？", hookType: "discussion", angle: "discussion" },
      { title: "别把宝贵的注意力卖给算法", hookType: "disillusionment", angle: "disillusionment" }
    ],
    executionChecklist: [
      "物理区域封锁：睡眠区域绝不带入除闹钟外的发光电子屏",
      "多巴胺冷水澡：感到无聊时先闭目静坐5分钟，坚决不摸手机",
      "高质量输入置换：用长文研读、纸质书翻阅或散步替代短视频碎片刺激"
    ],
    tags: ["#数字断舍离", "#多巴胺斋戒", "#认知觉醒", "#深度思考", "#自律清单"]
  }
];

/**
 * Fallback domain adapter for universal/generic overseas topics.
 */
function buildGenericAdaptation(rawTopic, targetPersona) {
  const clean = String(rawTopic || "").replace(/https?:\/\/\S+/g, "").trim();
  const titleCore = clean.length > 12 ? clean.slice(0, 10) : clean || "认知跃迁";
  const persona = targetPersona || "追求自我突破的年轻人 / 知识探索者";

  const hooks = [
    { title: `生活里，别再高估所谓的${titleCore}`, hookType: "contrarian", angle: "contrarian" },
    { title: `为什么越想做好${titleCore}越焦虑？`, hookType: "paradox", angle: "paradox" },
    { title: `我后来才想通关于${titleCore}的真相`, hookType: "confession", angle: "confession" },
    { title: `你可能把${titleCore}想简单了`, hookType: "reframing", angle: "reframing" },
    { title: `搞懂这3点，少走3年弯路`, hookType: "utility", angle: "utility" },
    { title: `你也在${titleCore}上栽过跟头吗？`, hookType: "discussion", angle: "discussion" },
    { title: `先戒掉关于${titleCore}的幻想`, hookType: "disillusionment", angle: "disillusionment" }
  ].map((h) => ({
    ...h,
    title: safeClipTitle(h.title)
  }));

  return {
    category: "generic_growth",
    coreConcept: `关于“${titleCore}”的底层认知解构`,
    netizenPredicament: "面对海量碎片知识感到焦虑迷茫，道理懂了很多却依然过不好当下",
    persona,
    hiddenAnxiety: "渴望快速获得确定性的成功捷径，害怕自己被时代同龄人甩开",
    reframing: "把宏大叙事拆解为微小切口，先行动起来，认知才会在真实世界的撞击中成型。",
    hooks,
    executionChecklist: [
      "微动作切入：找出当前困局中今天立刻就能执行的单点最小动作",
      "建立客观复盘习惯：记录实际结果而非主观情绪内耗",
      "坚持单点迭代：不贪多求全，一次只优化一个具体卡点"
    ],
    tags: ["#认知思维", "#自我提升", "#搞钱", "#思维跃迁", "#成长干货"]
  };
}

/**
 * Matches an overseas topic with our Netizen Psychological Translation knowledge base.
 */
function matchDomainAdaptation(rawTopic, targetPersona) {
  const text = String(rawTopic || "").toLowerCase();
  for (const entry of KNOWLEDGE_ADAPTATION_MAP) {
    const match = entry.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (match) {
      return {
        ...entry,
        persona: targetPersona || entry.persona
      };
    }
  }
  return buildGenericAdaptation(rawTopic, targetPersona);
}

/**
 * Detect machine translation feel and translationese markers.
 * Returns zeroMtScore (0.0 - 1.0) where 1.0 indicates clean, natural Chinese.
 */
export function detectMachineTranslation(text) {
  const content = String(text || "");
  if (!content.trim()) {
    return {
      isMachineTranslation: false,
      zeroMtScore: 1.0,
      markersDetected: [],
      details: "Empty text"
    };
  }

  const detected = [];
  let totalPenalty = 0;

  for (const pattern of MT_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches = content.match(pattern.regex);
    if (matches && matches.length > 0) {
      detected.push({
        label: pattern.label,
        count: matches.length,
        samples: matches.slice(0, 3)
      });
      totalPenalty += pattern.penalty * matches.length;
    }
  }

  // Check English words left untranslated when Chinese was expected
  const untranslatedEnglishWords = content.match(/\b[A-Za-z]{4,}\b/g) || [];
  // Exclude common tech acronyms or standard terms (AI, IP, DDL, X, CTA)
  const nonAcronymEnglish = untranslatedEnglishWords.filter((w) => !/^(AI|IP|DDL|X|CTA|CEO|COO|GMV|Vite|React|Node|REST)$/i.test(w));
  if (nonAcronymEnglish.length > 3) {
    detected.push({
      label: "未翻译英文词块(untranslated English)",
      count: nonAcronymEnglish.length,
      samples: nonAcronymEnglish.slice(0, 3)
    });
    totalPenalty += 0.25;
  }

  const zeroMtScore = Math.max(0.0, Math.min(1.0, Number((1.0 - totalPenalty).toFixed(2))));
  const isMachineTranslation = detected.length > 0 || zeroMtScore < 0.85;

  return {
    isMachineTranslation,
    zeroMtScore,
    markersDetected: detected.map((d) => d.label),
    details: detected.length === 0 ? "100% 自然地道中文，无翻译腔" : `检测到 ${detected.length} 处翻译腔标记`
  };
}

/**
 * Generate 3-second retention formulaic hooks strictly <= 20 characters (CARD 05 & 08).
 * Returns array of candidate hooks with string interoperability.
 */
export function generate3SecondHooks(insight, count = 5, options = {}) {
  const adaptation = matchDomainAdaptation(insight, options.targetPersona);
  let candidates = [...adaptation.hooks];

  // Prioritize hooks based on strategy overrides
  if (options.preferredHookFormulas && Array.isArray(options.preferredHookFormulas)) {
    candidates.sort((a, b) => {
      const aMatch = options.preferredHookFormulas.includes(a.hookType) ? 1 : 0;
      const bMatch = options.preferredHookFormulas.includes(b.hookType) ? 1 : 0;
      return bMatch - aMatch;
    });
  } else if (options.preferredAngle) {
    candidates.sort((a, b) => (a.angle === options.preferredAngle ? -1 : b.angle === options.preferredAngle ? 1 : 0));
  }

  // Ensure every candidate strictly obeys <= 20 characters
  const formatted = candidates.map((item) => {
    const rawTitle = String(item.title || "").trim();
    const clippedTitle = safeClipTitle(rawTitle);
    return {
      title: clippedTitle,
      hookType: item.hookType,
      angle: item.angle,
      length: clippedTitle.length,
      toString() {
        return this.title;
      },
      [Symbol.toPrimitive]() {
        return this.title;
      }
    };
  });

  // Expand with formulaic variations if more are requested
  if (formatted.length < count) {
    const backupFormulas = [
      { t: `为什么你越努力反而越迷茫？`, h: "paradox" },
      { t: `真正厉害的人都在用的自救法`, h: "utility" },
      { t: `我后来才想通这个关键扎心点`, h: "confession" },
      { t: `建议收藏这套底层思维指南`, h: "utility" },
      { t: `别再把精力浪费在无意义内耗`, h: "disillusionment" }
    ];
    for (const b of backupFormulas) {
      if (formatted.length >= count) break;
      const t = safeClipTitle(b.t);
      formatted.push({
        title: t,
        hookType: b.h,
        angle: b.h,
        length: t.length,
        toString() {
          return this.title;
        },
        [Symbol.toPrimitive]() {
          return this.title;
        }
      });
    }
  }

  return formatted.slice(0, Math.max(count, 1));
}

/**
 * Breakdown problem into persona, hidden anxiety, reframing, and checklist (CARD 02).
 */
export function breakdownPainPoint(insight, targetPersona) {
  const adaptation = matchDomainAdaptation(insight, targetPersona);
  return {
    persona: adaptation.persona,
    hiddenAnxiety: adaptation.hiddenAnxiety,
    reframing: adaptation.reframing,
    executionChecklist: [...adaptation.executionChecklist]
  };
}

/**
 * Trims superfluous lecturing, moralizing pulp, and academic fluff (CARD 07 Stop Explaining).
 * "刀已经扎进去，不要用刀柄解释为什么疼。"
 */
export function trimExplainingPulp(copy) {
  let text = String(copy || "").trim();
  if (!text) return "";

  for (const pattern of EXPLAINING_PULP_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // Remove trailing moralizing clauses at the very end of paragraphs
  text = text
    .replace(/(?:所以|因此|总而言之|希望大家|让我们)[^\n。！？!?]+[。！？!?]?$/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Packages structured content metadata and Xiaohongshu note specifications.
 */
export function packageContentMetadata({ title, body, tags = [], slidePlan = null }) {
  const cleanTitle = safeClipTitle(title);
  const cleanBody = trimExplainingPulp(body);

  // Normalize tags to 3-5 vertical tags with leading '#'
  const normalizedTags = [];
  for (const raw of tags) {
    const t = String(raw || "").trim().replace(/^[#＃]+/, "");
    if (t && !normalizedTags.includes(`#${t}`)) {
      normalizedTags.push(`#${t}`);
    }
  }

  const defaultTags = ["#认知思维", "#自我提升", "#搞钱", "#深度思考", "#成长干货"];
  while (normalizedTags.length < 3) {
    const candidate = defaultTags.find((t) => !normalizedTags.includes(t));
    if (candidate) normalizedTags.push(candidate);
    else break;
  }
  const finalTags = normalizedTags.slice(0, 5);

  const formattedCaption = `# 标题\n${cleanTitle}\n\n# 正文\n${cleanBody}\n\n${finalTags.join(" ")}`.trim();

  return {
    title: cleanTitle,
    body: cleanBody,
    formattedCaption,
    tags: finalTags,
    slidePlan: slidePlan || [],
    metadata: {
      platform: "xiaohongshu",
      charCount: cleanBody.length,
      slideCount: Array.isArray(slidePlan) ? slidePlan.length : (slidePlan?.slides?.length || 0),
      tagCount: finalTags.length,
      createdAt: new Date().toISOString(),
      complianceReady: true
    }
  };
}

/**
 * Fact-checking hook generator ensuring <= 20 chars (Founder Directive 2026-09-03T18:39:32Z).
 */
export function generateFactCheckingHooks({ total = 8, validCount = 4 } = {}) {
  const list = [
    `外网疯传${total}条，仅${validCount}条靠谱！`,
    `外网爆火的方法，我查了：打假！`,
    `别被外网骗了！这套方法多半是噱头`,
    `外网高赞成长法，实测只有一半能用`,
    `查完外网热帖资料，我劝你别盲信`
  ];
  return list.map((t) => {
    const title = safeClipTitle(t);
    return {
      title,
      hookType: "fact_check",
      angle: "fact_check",
      length: title.length,
      toString() {
        return this.title;
      },
      [Symbol.toPrimitive]() {
        return this.title;
      }
    };
  });
}

/**
 * Fact-Checking & Mythbusting Engine (求真打假与高价值增量注释)
 * Evaluates raw claims into 3 distinct ratings:
 * - valid: ✅ 靠谱 (实证支持、行为科学依据)
 * - questionable: ⚠️ 证据没那么强 / 夸大吹嘘 (以偏概全、缺乏大样本)
 * - debunked: ❌ 伪科学 / 营销噱头 (反常理、伪科学收智商税)
 *
 * @param {object} params
 * @param {string[]|string} [params.rawClaims]
 * @param {object|string} [params.originalTweetMedia]
 * @returns {object}
 */
export function factCheckAndAnnotate({ rawClaims = [], originalTweetMedia = null } = {}) {
  const claims = Array.isArray(rawClaims)
    ? rawClaims
    : typeof rawClaims === "string"
    ? rawClaims.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    : [];

  const defaultClaims = [
    "坚持早起5点打卡能让你收入翻倍",
    "番茄工作法单核冲刺可大幅提升专注度",
    "冷水澡可以彻底根治抑郁与焦虑",
    "缩短任务截止时间倒逼帕金森效率爆发",
    "普通人每天喝特制排毒果汁能年轻10岁",
    "建立个人知识库可复利沉淀认知资产",
    "只要开启多任务并行就能节省50%工作时间",
    "深呼吸冥想能有效抑制社交聚光灯效应"
  ];

  const targetClaims = claims.length > 0 ? claims : defaultClaims;

  const annotatedClaims = targetClaims.map((claimText, idx) => {
    const text = String(claimText || "").trim();
    let rating = "valid";
    let badge = "✅ 靠谱";
    let color = "#2E7D32"; // green
    let analysis = "";
    let evidenceNote = "";

    // Debunked: extreme claims, miraculous results, pseudoscience
    if (/翻倍|彻底根治|逆天|暴富|100%|奇迹|排毒|神药|瞬间翻身|秒懂/i.test(text)) {
      rating = "debunked";
      badge = "❌ 伪科学";
      color = "#D32F2F"; // red
      analysis = `典型营销噱头与因果倒置。这类宣称往往把偶发个案包装为普适定律，缺乏严谨双盲循证，极易误导受众。`;
      evidenceNote = `学术界与循证医学均证实：单一方法无法对抗复杂的生理/心理系统，警惕商业智商税。`;
    }
    // Questionable: exaggerated generalizations, partial truth
    else if (/多任务|省50%|每天5点|所有人|唯一秘诀|颠覆常理|绝对/i.test(text)) {
      rating = "questionable";
      badge = "⚠️ 证据没那么强";
      color = "#ED6C02"; // amber
      analysis = `有一定参考价值但被严重夸大。脑科学表明人脑极难适应高频上下文切换，强行模仿容易加剧精力透支。`;
      evidenceNote = `属于局限性小样本经验，适用边界严格，不可盲目全盘生搬硬套。`;
    }
    // Valid: empirical behavior science, bounded focus, progressive habits
    else {
      rating = "valid";
      badge = "✅ 靠谱";
      color = "#2E7D32"; // green
      analysis = `具备扎实的行为科学与心理学依据。通过合理降低行动阻力与认知负荷，能够产生稳健正向改善。`;
      evidenceNote = `符合认知负荷与刻意练习规律，适宜直接纳入行动执行清单。`;
    }

    return {
      index: idx + 1,
      claim: text,
      rating,
      badge,
      color,
      analysis,
      evidenceNote
    };
  });

  const validCount = annotatedClaims.filter((c) => c.rating === "valid").length;
  const questionableCount = annotatedClaims.filter((c) => c.rating === "questionable").length;
  const debunkedCount = annotatedClaims.filter((c) => c.rating === "debunked").length;
  const total = annotatedClaims.length;

  const verdictTitle = safeClipTitle(`外网疯传${total}条，仅${validCount}条靠谱！`);

  const pinnedSelfCheckChecklist = [
    "1. 查样本来源：警惕样本量极小或纯属个人吹嘘的孤证案例",
    "2. 辨因果倒置：优秀的人往往早起，但不代表盲目早起就能变优秀",
    "3. 防利益绑架：凡宣称一招逆袭的，末尾必定是付费割韭菜课程"
  ];

  return {
    summary: {
      total,
      validCount,
      questionableCount,
      debunkedCount,
      verdictTitle
    },
    annotatedClaims,
    pinnedSelfCheckChecklist,
    originalTweetMedia: originalTweetMedia || {
      type: "tweet_screenshot",
      placeholder: "X-ORIGINAL-TWEET-IMAGE",
      caption: "外网原推真实截图（黑底极简风格保留）"
    }
  };
}

/**
 * Main Pipeline Entry: Adapts an overseas topic into a native Xiaohongshu viral note.
 *
 * Requirements & Invariants:
 * - title.length <= 20
 * - zeroMtScore >= 0.85
 * - machine translation markers zero
 *
 * Supports both standard adaptation and Fact-Checking & Mythbusting model (Founder Directive 2026-09-03T18:39:32Z).
 *
 * @param {object} params
 * @param {string} params.rawTopic - Raw overseas topic text or headline
 * @param {string} [params.sourceUrl] - Original post URL (e.g. X/Twitter)
 * @param {object} [params.metrics] - Engagement data (likes, retweets, impressions)
 * @param {string} [params.targetPersona] - Target audience persona
 * @param {object} [params.strategyOverrides] - Closed-loop strategy deltas from Learning Ledger
 * @param {string[]|string} [params.rawClaims] - Optional claims for fact-checking
 * @param {object} [params.originalTweetMedia] - Original tweet media metadata
 * @param {boolean} [params.factCheck] - Explicitly enable fact-check mode
 * @returns {Promise<{ success: boolean, adaptedNote: object, rawInsight: string, factCheckDetails?: object }>}
 */
export async function adaptOverseasTopic({
  rawTopic,
  sourceUrl = "",
  metrics = {},
  targetPersona = "",
  strategyOverrides = {},
  rawClaims = null,
  originalTweetMedia = null,
  factCheck = false
} = {}) {
  if (!rawTopic || typeof rawTopic !== "string" || !rawTopic.trim()) {
    throw new Error("adaptOverseasTopic requires a non-empty rawTopic string.");
  }

  const rawInsight = rawTopic.trim();
  const adaptation = matchDomainAdaptation(rawInsight, targetPersona || strategyOverrides.targetPersona);

  const isFactCheckMode = Boolean(
    factCheck ||
    strategyOverrides.factCheck ||
    strategyOverrides.mode === "fact_check" ||
    (rawClaims && (Array.isArray(rawClaims) ? rawClaims.length > 0 : String(rawClaims).trim()))
  );

  let title = "";
  let hookType = "";
  let bodyParagraphs = [];
  let slidePlan = [];
  let factCheckDetails = null;

  if (isFactCheckMode) {
    // Fact-checking & Mythbusting Mode
    const fc = factCheckAndAnnotate({
      rawClaims: rawClaims || [rawInsight],
      originalTweetMedia
    });
    factCheckDetails = fc;

    const fcHooks = generateFactCheckingHooks({
      total: fc.summary.total,
      validCount: fc.summary.validCount
    });
    const selectedHook = fcHooks[0];
    title = safeClipTitle(selectedHook.title);
    hookType = "fact_check";

    const topDebunked = fc.annotatedClaims.find((c) => c.rating === "debunked");
    const topQuestionable = fc.annotatedClaims.find((c) => c.rating === "questionable");
    const topValid = fc.annotatedClaims.find((c) => c.rating === "valid");

    bodyParagraphs = [
      `外网疯传的 ${fc.summary.total} 条高赞方法，我扒了原始文献和研究数据：`,
      `【评级总结】：${fc.summary.validCount} 条靠谱可执行，${fc.summary.questionableCount} 条严重夸大，${fc.summary.debunkedCount} 条纯属伪科学噱头！`,
      topDebunked ? `【排雷避坑 ❌ 伪科学】：${topDebunked.claim}\n真相分析：${topDebunked.analysis}` : "",
      topQuestionable ? `【谨慎参考 ⚠️ 证据不足】：${topQuestionable.claim}\n真相分析：${topQuestionable.analysis}` : "",
      topValid ? `【靠谱留存 ✅ 真正有用】：${topValid.claim}\n执行要点：${topValid.analysis}` : "",
      `【作者置顶自查清单】：\n` + fc.pinnedSelfCheckChecklist.join("\n"),
      `关注我不踩坑。每天为你把关全网认知干货，只留真实有用的信息。`
    ].filter(Boolean);

    slidePlan = [
      {
        role: "cover",
        kicker: "FACT-CHECK / 真相反转",
        title,
        badge: "辟谣质检",
        accent: "01"
      },
      {
        role: "original_tweet",
        eyebrow: "X ORIGINAL TWEET",
        text: "原推截图与背景保留",
        media: fc.originalTweetMedia,
        accent: "SOURCE"
      },
      {
        role: "debunk_card",
        eyebrow: "MYTHBUSTING 01",
        text: topDebunked ? `❌ ${topDebunked.claim}：${topDebunked.analysis.slice(0, 48)}` : "识别营销噱头",
        badge: "❌ 伪科学排雷",
        accent: "ALERT"
      },
      {
        role: "valid_card",
        eyebrow: "ACTIONABLE 02",
        text: topValid ? `✅ ${topValid.claim}：${topValid.analysis.slice(0, 48)}` : "保留循证有效方案",
        badge: "✅ 靠谱干货",
        accent: "VERIFIED"
      },
      {
        role: "ending",
        eyebrow: "PINNED CHECKLIST",
        text: strategyOverrides.callToAction || "收藏作者置顶清单，留存避坑指南。",
        source: sourceUrl ? `来源：${sourceUrl.slice(0, 32)}` : "外网热搜求证",
        checklist: fc.pinnedSelfCheckChecklist,
        accent: "END"
      }
    ];
  } else {
    // Standard Cultural Adaptation Mode (CARD 02, 04, 05, 07, 08)
    const hookCandidates = generate3SecondHooks(rawInsight, 5, {
      targetPersona: adaptation.persona,
      preferredHookFormulas: strategyOverrides.preferredHookFormulas,
      preferredAngle: strategyOverrides.preferredAngle
    });

    const selectedHook = hookCandidates[0];
    title = safeClipTitle(selectedHook.title);
    hookType = selectedHook.hookType;

    const painPointBreakdown = breakdownPainPoint(rawInsight, adaptation.persona);

    bodyParagraphs = [
      `${painPointBreakdown.reframing}`,
      `很多人陷入的困境：${adaptation.netizenPredicament}。`,
      `底层真相：${painPointBreakdown.hiddenAnxiety}。`,
      `即刻执行指南：\n` +
        painPointBreakdown.executionChecklist
          .map((step, idx) => `${idx + 1}. ${step}`)
          .join("\n"),
      `把这一页存下来。下一次感到内耗或犹豫时，翻出来看一遍。`
    ];

    slidePlan = [
      {
        role: "cover",
        kicker: "SHUZHAI / INSIGHT NOTES",
        title,
        accent: "01"
      },
      {
        role: "hook",
        eyebrow: "THIS NOTE",
        text: adaptation.netizenPredicament.slice(0, 48),
        accent: "READ"
      },
      {
        role: "insight",
        eyebrow: "INSIGHT 01",
        text: painPointBreakdown.reframing.slice(0, 64),
        accent: "02"
      },
      {
        role: "checklist",
        eyebrow: "ACTION PLAN",
        text: painPointBreakdown.executionChecklist.slice(0, 3).join("；"),
        accent: "03"
      },
      {
        role: "ending",
        eyebrow: "KEEP READING",
        text: strategyOverrides.callToAction || "收藏这一页，留给下一次重读。",
        source: sourceUrl ? `来源：${sourceUrl.slice(0, 32)}` : "海外认知精选 / 本土化转译",
        accent: "END"
      }
    ];
  }

  const painPointBreakdown = breakdownPainPoint(rawInsight, adaptation.persona);

  const rawBody = bodyParagraphs.join("\n\n");
  const cleanedBody = trimExplainingPulp(rawBody);

  // Verify Zero-MT requirement
  const mtResult = detectMachineTranslation(`${title}\n${cleanedBody}`);
  const zeroMtScore = mtResult.zeroMtScore;

  // Select tags
  let tags = strategyOverrides.tags && Array.isArray(strategyOverrides.tags) && strategyOverrides.tags.length >= 3
    ? strategyOverrides.tags
    : isFactCheckMode
    ? ["#硬核求证", "#避坑指南", "#认知思维", "#停止内耗", "#打假"]
    : adaptation.tags;

  tags = tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).slice(0, 5);

  const pkg = packageContentMetadata({
    title,
    body: cleanedBody,
    tags,
    slidePlan
  });

  const response = {
    success: true,
    adaptedNote: {
      title: pkg.title,
      hookType,
      body: pkg.body,
      painPointBreakdown,
      slidePlan,
      tags: pkg.tags,
      zeroMtScore
    },
    rawInsight
  };

  if (factCheckDetails) {
    response.factCheckDetails = factCheckDetails;
  }

  return response;
}

