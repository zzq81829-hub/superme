import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Circadian Anti-Ban Scheduler & Hashtag Pipeline (一人内容公司 - R3)
 *
 * Implements:
 * 1. evaluateCircadianWindow(nowDate):
 *    - Active high-traffic windows: lunch (11:30~13:30) and evening prime-time (18:00~20:30).
 *    - Night physiological silence: 23:30~08:30 (strictly suspended, returns { suspended: true, reason: 'night_silence' }).
 *    - Returns { allowed, windowName, targetWindow, windowId, isQuietHours, suspended, reason, nextAvailableWindow }.
 *
 * 2. calculateBioJitter(targetTimeDate, options):
 *    - Adds randomized ±15~35 min offset (Gaussian / uniform pseudo-random within bounds).
 *    - Clamps jittered time so it does not escape active window boundaries.
 *    - Returns { scheduledTime: Date, jitterMinutes: number, rawJitterMinutes: number, clamped: boolean }.
 *
 * 3. selectVerticalHashtags({ category, keywords, contentText, count }):
 *    - Selects 3~5 high-weight vertical Xiaohongshu tags (e.g. #认知思维, #搞钱, #自我提升, #书单).
 *    - Returns string[] of tags, strictly >= 3 and <= 5.
 *
 * 4. processPublishQueue({ queuePath, gateMode, onPublishCallback, now }):
 *    - Dual-mode gate: 'auto' releases compliant notes in window; 'manual_buffer' safely buffers items until explicit founder release.
 *    - Night physiological silence check suspends execution.
 *    - Returns Promise<{ released: array, buffered: array, skipped: array, suspended: boolean, windowStatus: object }>.
 *
 * 5. processQueue(options):
 *    - Alias for processPublishQueue adhering to PROJECT.md interface contract.
 */

export const CIRCADIAN_WINDOWS = {
  LUNCH: {
    id: "lunch",
    name: "lunch",
    alias: "midday_traffic",
    startH: 11,
    startM: 30,
    endH: 13,
    endM: 30,
    label: "午间流量高峰 (11:30-13:30)"
  },
  EVENING: {
    id: "evening_prime",
    name: "evening_prime",
    alias: "evening_golden",
    startH: 18,
    startM: 0,
    endH: 20,
    endM: 30,
    label: "晚间黄金档 (18:00-20:30)"
  }
};

export const QUIET_HOURS = {
  startH: 23,
  startM: 30,
  endH: 8,
  endM: 30,
  label: "夜间生理静默期 (23:30-08:30)"
};

/**
 * Vertical Topic Hashtag Taxonomy & Weights for Xiaohongshu
 */
export const VERTICAL_TAG_TAXONOMY = {
  cognition: {
    name: "认知思维",
    keywords: ["认知", "思维", "底层逻辑", "认知差", "思考", "洞察", "反直觉", "模型", "顿悟", "深度思考", "心智", "认知破局", "认知觉醒"],
    tags: ["#认知思维", "#底层逻辑", "#思维跃迁", "#深度思考", "#认知破局", "#认知差", "#逆向思维", "#认知觉醒"]
  },
  wealth: {
    name: "搞钱商业",
    keywords: ["搞钱", "赚钱", "商业", "副业", "变现", "创业", "资产", "财富", "现金流", "商业模式", "轻资产", "商业认知", "盈利"],
    tags: ["#搞钱", "#搞钱思维", "#商业认知", "#搞钱日常", "#副业搞钱", "#商业模式", "#赚钱认知", "#轻资产创业"]
  },
  growth: {
    name: "自我提升",
    keywords: ["自我提升", "个人成长", "成长", "自律", "习惯", "进化", "改变", "提升", "高效", "学习", "蜕变", "能力", "复盘"],
    tags: ["#自我提升", "#个人成长", "#自律", "#成长蜕变", "#提升自己", "#高效学习", "#习惯养成", "#人生重塑"]
  },
  books: {
    name: "书单阅读",
    keywords: ["书单", "读书", "阅读", "好书", "经典", "书籍", "书评", "读物", "拆书", "书单推荐", "图书", "干货", "知识"],
    tags: ["#书单", "#读书笔记", "#书单推荐", "#干货分享", "#优质书单", "#我的私人书单", "#经典好书", "#阅读分享"]
  },
  workplace: {
    name: "职场进阶",
    keywords: ["职场", "工作", "上班", "同事", "领导", "汇报", "打工人", "职业", "晋升", "跳槽", "向上管理"],
    tags: ["#职场干货", "#职场进阶", "#工作效率", "#职场思维", "#向上管理"]
  },
  mindset: {
    name: "心理心智",
    keywords: ["心理", "内耗", "焦虑", "情绪", "心态", "清醒", "治愈", "心理学", "边界感", "抑郁", "自洽"],
    tags: ["#心理学", "#停止内耗", "#情绪价值", "#认知觉醒", "#清醒生活"]
  }
};

export const ANCHOR_TAGS = ["#认知思维", "#搞钱", "#自我提升", "#书单"];

/**
 * Computes the next active circadian window start date strictly after the given date.
 *
 * @param {Date} date
 * @returns {Date}
 */
function computeNextAvailableWindow(date) {
  const candidates = [];
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const dLunch = new Date(date);
    dLunch.setDate(dLunch.getDate() + dayOffset);
    dLunch.setHours(CIRCADIAN_WINDOWS.LUNCH.startH, CIRCADIAN_WINDOWS.LUNCH.startM, 0, 0);
    candidates.push(dLunch);

    const dEvening = new Date(date);
    dEvening.setDate(dEvening.getDate() + dayOffset);
    dEvening.setHours(CIRCADIAN_WINDOWS.EVENING.startH, CIRCADIAN_WINDOWS.EVENING.startM, 0, 0);
    candidates.push(dEvening);
  }

  const currentMs = date.getTime();
  for (const cand of candidates) {
    if (cand.getTime() > currentMs) {
      return cand;
    }
  }

  const fallback = new Date(date);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(CIRCADIAN_WINDOWS.LUNCH.startH, CIRCADIAN_WINDOWS.LUNCH.startM, 0, 0);
  return fallback;
}

/**
 * Evaluates whether the given date/time falls within human circadian active windows or night silence.
 *
 * Active high-traffic windows:
 * - Lunch: 11:30 ~ 13:30
 * - Evening prime-time: 18:00 ~ 20:30
 *
 * Night physiological silence:
 * - 23:30 ~ 08:30 (strictly suspended)
 *
 * @param {Date|number|string} [nowDate]
 * @returns {{
 *   allowed: boolean,
 *   windowName: string|null,
 *   targetWindow: string|null,
 *   windowId: string|null,
 *   isQuietHours: boolean,
 *   suspended: boolean,
 *   reason: string|null,
 *   nextAvailableWindow: Date
 * }}
 */
export function evaluateCircadianWindow(nowDate = new Date()) {
  const date = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const currentMinutes = hours * 60 + minutes + seconds / 60;

  const quietStart = QUIET_HOURS.startH * 60 + QUIET_HOURS.startM; // 1410 min (23:30)
  const quietEnd = QUIET_HOURS.endH * 60 + QUIET_HOURS.endM;       // 510 min (08:30)

  // Night physiological silence spans midnight: [23:30..24:00) or [00:00..08:30]
  const isQuietHours = currentMinutes >= quietStart || currentMinutes <= quietEnd;

  const lunchStart = CIRCADIAN_WINDOWS.LUNCH.startH * 60 + CIRCADIAN_WINDOWS.LUNCH.startM; // 690 min (11:30)
  const lunchEnd = CIRCADIAN_WINDOWS.LUNCH.endH * 60 + CIRCADIAN_WINDOWS.LUNCH.endM;       // 810 min (13:30)

  const eveningStart = CIRCADIAN_WINDOWS.EVENING.startH * 60 + CIRCADIAN_WINDOWS.EVENING.startM; // 1080 min (18:00)
  const eveningEnd = CIRCADIAN_WINDOWS.EVENING.endH * 60 + CIRCADIAN_WINDOWS.EVENING.endM;       // 1230 min (20:30)

  const isLunch = currentMinutes >= lunchStart && currentMinutes <= lunchEnd;
  const isEvening = currentMinutes >= eveningStart && currentMinutes <= eveningEnd;

  const allowed = !isQuietHours && (isLunch || isEvening);

  let windowName = null;
  let targetWindow = null;
  let windowId = null;

  if (isLunch) {
    windowName = CIRCADIAN_WINDOWS.LUNCH.name;
    targetWindow = CIRCADIAN_WINDOWS.LUNCH.alias;
    windowId = CIRCADIAN_WINDOWS.LUNCH.id;
  } else if (isEvening) {
    windowName = CIRCADIAN_WINDOWS.EVENING.name;
    targetWindow = CIRCADIAN_WINDOWS.EVENING.alias;
    windowId = CIRCADIAN_WINDOWS.EVENING.id;
  }

  const nextAvailableWindow = computeNextAvailableWindow(date);

  let reason = null;
  if (isQuietHours) {
    reason = "night_silence";
  } else if (!allowed) {
    reason = "outside_active_window";
  }

  return {
    allowed,
    windowName,
    targetWindow,
    windowId,
    isQuietHours,
    suspended: isQuietHours,
    reason,
    nextAvailableWindow
  };
}

/**
 * Finds the nearest active window boundaries for a target date.
 *
 * @param {Date} targetDate
 * @param {object} [customWindow]
 * @returns {{ start: Date, end: Date, name: string }}
 */
function getWindowBoundsForDate(targetDate, customWindow) {
  if (customWindow) {
    if (customWindow.start instanceof Date && customWindow.end instanceof Date) {
      return customWindow;
    }
    const start = new Date(targetDate);
    start.setHours(customWindow.startH ?? 0, customWindow.startM ?? 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(customWindow.endH ?? 23, customWindow.endM ?? 59, 59, 999);
    return { start, end, name: customWindow.name || "custom" };
  }

  const hours = targetDate.getHours();
  const minutes = targetDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Midpoint between lunch end (13:30 = 810) and evening start (18:00 = 1080) is 945 (15:45)
  if (currentMinutes <= 945) {
    const start = new Date(targetDate);
    start.setHours(CIRCADIAN_WINDOWS.LUNCH.startH, CIRCADIAN_WINDOWS.LUNCH.startM, 0, 0);
    const end = new Date(targetDate);
    end.setHours(CIRCADIAN_WINDOWS.LUNCH.endH, CIRCADIAN_WINDOWS.LUNCH.endM, 0, 0);
    return { start, end, name: CIRCADIAN_WINDOWS.LUNCH.name };
  } else {
    const start = new Date(targetDate);
    start.setHours(CIRCADIAN_WINDOWS.EVENING.startH, CIRCADIAN_WINDOWS.EVENING.startM, 0, 0);
    const end = new Date(targetDate);
    end.setHours(CIRCADIAN_WINDOWS.EVENING.endH, CIRCADIAN_WINDOWS.EVENING.endM, 0, 0);
    return { start, end, name: CIRCADIAN_WINDOWS.EVENING.name };
  }
}

/**
 * Adds randomized biological jitter (±15~35 min) to target scheduling time,
 * strictly clamped so it does not escape active window boundaries.
 *
 * @param {Date|number|string} [targetTimeDate]
 * @param {object} [options]
 * @param {number} [options.minMinutes=15]
 * @param {number} [options.maxMinutes=35]
 * @param {boolean} [options.clampToWindow=true]
 * @param {function} [options.randomFn=Math.random]
 * @param {number} [options.jitterMinutes] - Deterministic override for testing
 * @param {number} [options.sign] - Deterministic sign (+1 or -1) for testing
 * @param {object} [options.window] - Custom window boundary
 * @returns {{
 *   scheduledTime: Date,
 *   jitterMinutes: number,
 *   rawJitterMinutes: number,
 *   clamped: boolean
 * }}
 */
export function calculateBioJitter(targetTimeDate = new Date(), options = {}) {
  const targetTime = targetTimeDate instanceof Date ? targetTimeDate : new Date(targetTimeDate);
  const minMinutes = options.minMinutes ?? 15;
  const maxMinutes = options.maxMinutes ?? 35;
  const clampToWindow = options.clampToActiveWindow !== undefined
    ? Boolean(options.clampToActiveWindow)
    : (options.clampToWindow !== false);
  const randomFn = typeof options.randomFn === "function" ? options.randomFn : Math.random;

  let rawJitterMinutes;
  if (options.jitterMinutes !== undefined && options.jitterMinutes !== null) {
    rawJitterMinutes = Number(options.jitterMinutes);
  } else {
    const magnitude = minMinutes + randomFn() * (maxMinutes - minMinutes);
    let sign;
    if (options.sign !== undefined) {
      sign = Math.sign(options.sign) || 1;
    } else {
      sign = randomFn() < 0.5 ? -1 : 1;
    }
    rawJitterMinutes = sign * Math.round(magnitude);
  }

  const unclampedMs = targetTime.getTime() + rawJitterMinutes * 60 * 1000;
  let scheduledTime = new Date(unclampedMs);
  let clamped = false;

  if (clampToWindow) {
    const windowBounds = getWindowBoundsForDate(targetTime, options.window);
    if (windowBounds) {
      const minMs = windowBounds.start.getTime();
      const maxMs = windowBounds.end.getTime();

      if (unclampedMs < minMs) {
        scheduledTime = new Date(minMs);
        clamped = true;
      } else if (unclampedMs > maxMs) {
        scheduledTime = new Date(maxMs);
        clamped = true;
      }
    }
  }

  const effectiveJitterMinutes = Math.round(((scheduledTime.getTime() - targetTime.getTime()) / (60 * 1000)) * 10) / 10;

  return {
    scheduledTime,
    jitterMinutes: effectiveJitterMinutes,
    rawJitterMinutes,
    clamped
  };
}

/**
 * Normalizes hashtag format: ensures '#' prefix and removes whitespace/illegal punctuation.
 *
 * @param {string} tag
 * @returns {string}
 */
function normalizeHashtag(tag) {
  if (!tag || typeof tag !== "string") return "";
  let clean = tag.replace(/^[#＃\s]+/, "").trim();
  clean = clean.replace(/[.,，。！？!?：:;；\s\t\r\n`'"]/g, "");
  return clean ? `#${clean}` : "";
}

/**
 * Automatically extracts and matches 3~5 high-weight vertical Xiaohongshu tags
 * based on category, keywords, and content text.
 *
 * @param {object} [params]
 * @param {string} [params.category]
 * @param {string[]|string} [params.keywords]
 * @param {string} [params.contentText]
 * @param {number} [params.count=4]
 * @returns {string[]} Strictly 3 to 5 tags
 */
export function selectVerticalHashtags(params = {}) {
  const { category = "", keywords = [], contentText = "", count = 4 } = params;

  const targetCount = Math.max(3, Math.min(5, Number(count) || 4));

  const keywordList = Array.isArray(keywords)
    ? keywords.map(String)
    : String(keywords || "")
        .split(/[,，\s\t]+/)
        .filter(Boolean);

  const combinedText = [
    String(category || ""),
    keywordList.join(" "),
    String(contentText || "")
  ].join(" ").toLowerCase();

  // Score candidate tags across taxonomy
  const scoredTags = new Map();

  for (const [domainKey, domain] of Object.entries(VERTICAL_TAG_TAXONOMY)) {
    let domainScore = 0;

    // Check domain keywords
    for (const kw of domain.keywords) {
      const kwLower = kw.toLowerCase();
      if (category && category.toLowerCase().includes(kwLower)) {
        domainScore += 15;
      }
      for (const inputKw of keywordList) {
        if (inputKw.toLowerCase().includes(kwLower) || kwLower.includes(inputKw.toLowerCase())) {
          domainScore += 10;
        }
      }
      if (combinedText.includes(kwLower)) {
        domainScore += 3;
      }
    }

    // Score individual tags in domain
    domain.tags.forEach((tag, idx) => {
      const cleanTag = tag.replace(/^#/, "").toLowerCase();
      let tagScore = domainScore + (domain.tags.length - idx);

      if (combinedText.includes(cleanTag)) {
        tagScore += 20;
      }

      scoredTags.set(tag, (scoredTags.get(tag) || 0) + tagScore);
    });
  }

  // Also extract any pre-existing hashtag-like tokens directly mentioned in content
  const explicitTagMatches = combinedText.match(/#[^\s#，。！？]+/g) || [];
  for (const expTag of explicitTagMatches) {
    const norm = normalizeHashtag(expTag);
    if (norm) {
      scoredTags.set(norm, (scoredTags.get(norm) || 0) + 25);
    }
  }

  // Sort candidate tags by score descending
  const sortedCandidates = Array.from(scoredTags.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  // Deduplicate and filter
  const selectedTags = [];
  for (const tag of sortedCandidates) {
    const norm = normalizeHashtag(tag);
    if (norm && !selectedTags.includes(norm)) {
      selectedTags.push(norm);
    }
    if (selectedTags.length >= targetCount) {
      break;
    }
  }

  // Pad with anchor tags if fewer than targetCount
  if (selectedTags.length < targetCount) {
    for (const anchor of ANCHOR_TAGS) {
      if (!selectedTags.includes(anchor)) {
        selectedTags.push(anchor);
      }
      if (selectedTags.length >= targetCount) {
        break;
      }
    }
  }

  // Enforce boundary invariants: strictly 3 to 5 tags
  const finalTags = selectedTags.slice(0, targetCount);
  while (finalTags.length < 3) {
    for (const anchor of ANCHOR_TAGS) {
      if (!finalTags.includes(anchor)) {
        finalTags.push(anchor);
      }
      if (finalTags.length >= 3) break;
    }
  }

  return finalTags.slice(0, 5);
}

/**
 * Loads the scheduler queue from disk.
 *
 * @param {string} filePath
 * @returns {Array<object>}
 */
export function loadSchedulerQueue(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the scheduler queue to disk.
 *
 * @param {Array<object>} items
 * @param {string} filePath
 * @returns {boolean}
 */
export function saveSchedulerQueue(items, filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the default scheduler queue path.
 *
 * @param {string} [overridePath]
 * @returns {string}
 */
function resolveQueuePath(overridePath) {
  return overridePath || process.env.SCHEDULER_QUEUE_PATH || path.join(process.cwd(), "data", "scheduler", "queue.json");
}

/**
 * Calculates the next upcoming active publishing slot with BioJitter applied.
 *
 * @param {Date|number|string} [now=new Date()]
 * @param {object} [options]
 * @returns {{
 *   scheduledTime: Date,
 *   jitterMinutes: number,
 *   targetWindow: string,
 *   rawJitterMinutes: number,
 *   clamped: boolean
 * }}
 */
export function calculateNextPublishSlot(now = new Date(), options = {}) {
  const date = now instanceof Date ? now : new Date(now);
  const evalResult = evaluateCircadianWindow(date);

  let targetDate;
  let targetWindowName;

  if (evalResult.allowed) {
    targetDate = date;
    targetWindowName = evalResult.windowName;
  } else {
    targetDate = evalResult.nextAvailableWindow;
    const nextEval = evaluateCircadianWindow(targetDate);
    targetWindowName = nextEval.windowName || CIRCADIAN_WINDOWS.EVENING.name;
  }

  const jitterResult = calculateBioJitter(targetDate, options);

  return {
    scheduledTime: jitterResult.scheduledTime,
    jitterMinutes: jitterResult.jitterMinutes,
    targetWindow: targetWindowName,
    rawJitterMinutes: jitterResult.rawJitterMinutes,
    clamped: jitterResult.clamped
  };
}

/**
 * Enqueues an item or content package into the scheduler queue.
 *
 * @param {object} itemData
 * @param {object} [options]
 * @returns {object} The queued item
 */
export function enqueueQueueItem(itemData = {}, options = {}) {
  const queuePath = resolveQueuePath(options.queuePath || itemData.queuePath);
  const queue = loadSchedulerQueue(queuePath);

  const id = itemData.id || `q_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const now = options.now instanceof Date ? options.now : new Date();

  let scheduledTime = itemData.scheduledTime;
  let jitterMinutes = itemData.jitterMinutes ?? 0;
  let targetWindow = itemData.targetWindow;

  if (!scheduledTime) {
    const nextSlot = calculateNextPublishSlot(now, options);
    scheduledTime = nextSlot.scheduledTime.toISOString();
    jitterMinutes = nextSlot.jitterMinutes;
    targetWindow = nextSlot.targetWindow;
  } else if (typeof scheduledTime === "object" && scheduledTime.toISOString) {
    scheduledTime = scheduledTime.toISOString();
  }

  let hashtags = itemData.hashtags;
  if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
    hashtags = selectVerticalHashtags({
      category: itemData.category,
      keywords: itemData.keywords,
      contentText: itemData.content || itemData.body || itemData.title,
      count: itemData.hashtagCount || 4
    });
  }

  const gateMode = itemData.gateMode || options.gateMode || "auto";
  const isManual = gateMode === "manual_buffer" || gateMode === "manual_gate";
  const status = isManual ? "awaiting_manual_approval" : (itemData.status || "pending");
  const compliancePassed = itemData.compliancePassed !== undefined ? Boolean(itemData.compliancePassed) : true;

  const newItem = {
    id,
    packageId: itemData.packageId || itemData.id || id,
    accountId: itemData.accountId || "default",
    title: itemData.title || "",
    gateMode,
    status,
    targetWindow: targetWindow || CIRCADIAN_WINDOWS.EVENING.name,
    scheduledTime,
    jitterMinutes,
    compliancePassed,
    hashtags,
    createdAt: itemData.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    founderApproved: itemData.founderApproved || false,
    released: itemData.released || false,
    meta: itemData.meta || {}
  };

  queue.push(newItem);
  saveSchedulerQueue(queue, queuePath);
  return newItem;
}

/**
 * Enqueues a content package by packageId.
 *
 * @param {string} packageId
 * @param {object} [options]
 * @returns {object}
 */
export function enqueueContentPackage(packageId, options = {}) {
  return enqueueQueueItem({ packageId, ...options }, options);
}

/**
 * Founder "一键放行": Releases a buffered queue item from manual gate.
 *
 * @param {string} itemIdOrPackageId
 * @param {object} [options]
 * @returns {{ success: boolean, item?: object, error?: string }}
 */
export function releaseQueueItem(itemIdOrPackageId, options = {}) {
  const queuePath = resolveQueuePath(options.queuePath);
  const queue = loadSchedulerQueue(queuePath);

  const item = queue.find((it) => it.id === itemIdOrPackageId || it.packageId === itemIdOrPackageId);
  if (!item) {
    return { success: false, error: `Queue item not found: ${itemIdOrPackageId}` };
  }

  item.status = "ready_to_publish";
  item.founderApproved = true;
  item.released = true;
  item.updatedAt = new Date().toISOString();

  saveSchedulerQueue(queue, queuePath);
  return { success: true, item };
}

/**
 * Processes the circadian publishing queue with dual-mode gatekeeper.
 *
 * Dual-mode gate:
 * - 'auto': Automatically releases compliant notes when scheduled time arrives within circadian window.
 * - 'manual_buffer': Safely buffers items at 'awaiting_manual_approval' until explicitly released by founder.
 *
 * Night silence constraint:
 * - During 23:30 ~ 08:30, execution is strictly suspended.
 *
 * @param {object} [options]
 * @param {string} [options.queuePath]
 * @param {'auto'|'manual_buffer'|'manual_gate'} [options.gateMode='auto']
 * @param {function} [options.onPublishCallback]
 * @param {Date|number|string} [options.now]
 * @param {boolean} [options.forcePublish=false]
 * @returns {Promise<{
 *   released: Array<object>,
 *   buffered: Array<object>,
 *   skipped: Array<object>,
 *   suspended: boolean,
 *   reason?: string,
 *   windowStatus: object,
 *   queuePath: string
 * }>}
 */
export async function processPublishQueue(options = {}) {
  const nowDate = options.now instanceof Date
    ? options.now
    : (options.now ? new Date(options.now) : new Date());

  const gateMode = options.gateMode || "auto";
  const queuePath = resolveQueuePath(options.queuePath);
  const forcePublish = Boolean(options.forcePublish);

  const windowEval = evaluateCircadianWindow(nowDate);

  // Night physiological silence enforcement: publishing is suspended during quiet hours,
  // but manual buffer gate continues buffering items awaiting founder review.
  if (windowEval.isQuietHours && !forcePublish && gateMode !== "manual_buffer" && gateMode !== "manual_gate") {
    return {
      suspended: true,
      reason: "night_silence",
      released: [],
      buffered: [],
      skipped: [],
      windowStatus: windowEval,
      queuePath
    };
  }

  const queue = loadSchedulerQueue(queuePath);
  if (queue.length === 0) {
    return {
      suspended: windowEval.isQuietHours,
      reason: windowEval.isQuietHours ? "night_silence" : null,
      released: [],
      buffered: [],
      skipped: [],
      windowStatus: windowEval,
      queuePath
    };
  }

  const released = [];
  const buffered = [];
  const skipped = [];

  for (const item of queue) {
    // Skip already finalized items
    if (item.status === "published" || item.status === "cancelled") {
      continue;
    }

    // Check due time
    const scheduledTime = item.scheduledTime ? new Date(item.scheduledTime) : null;
    const isDue = !scheduledTime || scheduledTime.getTime() <= nowDate.getTime() || forcePublish;

    if (!isDue) {
      skipped.push({ ...item, reason: "scheduled_in_future" });
      continue;
    }

    // Check Gate Mode
    const effectiveGateMode = item.gateMode || gateMode;
    const isManualGate = effectiveGateMode === "manual_buffer" || effectiveGateMode === "manual_gate";
    const isExplicitlyApproved = item.status === "ready_to_publish" || item.founderApproved === true || item.released === true;

    if (isManualGate && !isExplicitlyApproved) {
      item.status = "awaiting_manual_approval";
      item.updatedAt = nowDate.toISOString();
      buffered.push({ ...item, reason: "awaiting_founder_release" });
      continue;
    }

    // Compliance check
    if (item.compliancePassed === false) {
      item.status = "compliance_blocked";
      item.updatedAt = nowDate.toISOString();
      skipped.push({ ...item, reason: "compliance_blocked" });
      continue;
    }

    // Night physiological silence check before actual publish
    if (windowEval.isQuietHours && !forcePublish) {
      skipped.push({ ...item, reason: "night_silence" });
      continue;
    }

    // Ready for release & publish
    item.status = "published";
    item.publishedAt = nowDate.toISOString();
    item.updatedAt = nowDate.toISOString();

    if (typeof options.onPublishCallback === "function") {
      try {
        await options.onPublishCallback(item);
      } catch (callbackErr) {
        item.publishError = String(callbackErr?.message || callbackErr);
      }
    }

    released.push(item);
  }

  saveSchedulerQueue(queue, queuePath);

  return {
    suspended: windowEval.isQuietHours,
    reason: windowEval.isQuietHours ? "night_silence" : null,
    released,
    buffered,
    skipped,
    windowStatus: windowEval,
    queuePath
  };
}

/**
 * Public interface alias for processPublishQueue adhering to PROJECT.md §3 contract:
 * processQueue({ gateMode: 'auto'|'manual_buffer' }) => Promise<{ released: array, buffered: array, skipped: array }>
 *
 * @param {object} [options]
 * @returns {Promise<{ released: Array<object>, buffered: Array<object>, skipped: Array<object> }>}
 */
export async function processQueue(options = {}) {
  return processPublishQueue(options);
}

/**
 * Helper to inspect the current queue.
 *
 * @param {string} [queuePath]
 * @returns {Array<object>}
 */
export function getSchedulerQueue(queuePath) {
  return loadSchedulerQueue(resolveQueuePath(queuePath));
}

/**
 * Helper to clear the queue (for test isolation and teardown).
 *
 * @param {string} [queuePath]
 * @returns {boolean}
 */
export function clearSchedulerQueue(queuePath) {
  return saveSchedulerQueue([], resolveQueuePath(queuePath));
}
