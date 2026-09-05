export const CARD_LAYOUT_STANDARD = {
  bannerBridgeGap: { min: 36, max: 52 },
  artBannerBridge: { min: 36, max: 52 },
  titleSpacing: { min: 88, max: 96 },
  breathingGap: { min: 26, max: 32 },
  microCard: { opacity: 0.70, radius: 13, indicatorWidth: 7 },
  anchorCard: { minHeight: 118 }
};

const DEFAULT_TEMPLATE_ID = "shuzhai-editorial-v1";

export const XIAOHONGSHU_LAYOUT_TEMPLATES = {
  [DEFAULT_TEMPLATE_ID]: {
    id: DEFAULT_TEMPLATE_ID,
    name: "书斋·编辑感书摘",
    version: 1,
    canvas: { width: 1080, height: 1440, ratio: "3:4" },
    safeArea: { top: 88, right: 76, bottom: 112, left: 76 },
    palette: { ink: "#121212", ivory: "#F4EFE6", accent: "#A30F22" },
    typography: {
      coverTitle: { maxLines: 3, maxCharsPerLine: 12 },
      body: { minSize: 42, maxCharsPerPage: 64, maxLines: 6 },
      kicker: { text: "SHUZHAI / READING NOTES" }
    },
    slidePolicy: { minimum: 4, maximum: 7, ending: "save_and_follow" }
  },
  "shuzhai-card-standard-v1": {
    id: "shuzhai-card-standard-v1",
    name: "书斋·卡片排版标准",
    version: 1,
    canvas: { width: 1080, height: 1440, ratio: "3:4" },
    safeArea: { top: 88, right: 76, bottom: 112, left: 76 },
    palette: { ink: "#121212", ivory: "#F4EFE6", accent: "#A30F22" },
    typography: {
      coverTitle: { maxLines: 3, maxCharsPerLine: 12 },
      body: { minSize: 42, maxCharsPerPage: 64, maxLines: 6 },
      kicker: { text: "SHUZHAI / READING NOTES" }
    },
    bannerBridgeGap: { min: 36, max: 52 },
    artBannerBridge: { min: 36, max: 52 },
    titleSpacing: { min: 88, max: 96 },
    breathingGap: { min: 26, max: 32 },
    microCard: { opacity: 0.70, radius: 13, indicatorWidth: 7 },
    anchorCard: { minHeight: 118 },
    slidePolicy: { minimum: 4, maximum: 7, ending: "save_and_follow" }
  },
  "x-curation-dark-v1": {
    id: "x-curation-dark-v1",
    name: "X推特编译·暗黑极简",
    version: 1,
    canvas: { width: 1080, height: 1440, ratio: "3:4" },
    safeArea: { top: 88, right: 76, bottom: 112, left: 76 },
    palette: { ink: "#FFFFFF", ivory: "#000000", accent: "#1D9BF0" },
    typography: {
      coverTitle: { maxLines: 2, maxCharsPerLine: 10 },
      body: { minSize: 36, maxCharsPerPage: 120, maxLines: 12 },
      kicker: { text: "X / FACT-CHECK & CURATION" }
    },
    slidePolicy: { minimum: 1, maximum: 4, ending: "discuss_and_follow" }
  }
};

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clip(value, max) {
  const text = compactText(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

function splitIntoChunks(text, maxChars) {
  const source = compactText(text);
  if (!source) return [];

  const sentences = source.split(/(?<=[。！？!?；;])/u).map(compactText).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences.length ? sentences : [source]) {
    if (current && (current.length + sentence.length > maxChars)) {
      chunks.push(current);
      current = "";
    }
    if (sentence.length > maxChars) {
      for (let index = 0; index < sentence.length; index += maxChars) {
        const part = sentence.slice(index, index + maxChars);
        if (part.length === maxChars) chunks.push(part);
        else current = part;
      }
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function listXiaohongshuLayoutTemplates() {
  return Object.values(XIAOHONGSHU_LAYOUT_TEMPLATES);
}

export function normalizeXiaohongshuLayout(input, { platform = "xiaohongshu" } = {}) {
  if (platform !== "xiaohongshu") return null;

  const raw = typeof input === "string" ? { templateId: input } : (input || {});
  const templateId = String(raw.templateId || DEFAULT_TEMPLATE_ID).trim();
  if (!XIAOHONGSHU_LAYOUT_TEMPLATES[templateId]) {
    throw new Error(`Unsupported Xiaohongshu layout template: ${templateId}`);
  }

  const callToAction = compactText(raw.callToAction || "收藏这一页，留给下一次重读。");
  if (callToAction.length > 32) {
    throw new Error("Xiaohongshu layout callToAction must be 32 characters or fewer.");
  }

  return { templateId, callToAction };
}

export function buildXiaohongshuLayoutPlan(pkg) {
  const layout = normalizeXiaohongshuLayout(pkg?.layout, { platform: pkg?.platform });
  if (!layout) return null;

  const template = XIAOHONGSHU_LAYOUT_TEMPLATES[layout.templateId];
  const title = clip(pkg?.title, template.typography.coverTitle.maxLines * template.typography.coverTitle.maxCharsPerLine);
  const expressions = (pkg?.layers?.expressions || []).map((item) => compactText(item.text)).filter(Boolean);
  const chunks = splitIntoChunks(pkg?.body, template.typography.body.maxCharsPerPage);
  const facts = (pkg?.layers?.facts || []).map((item) => compactText(item.source || item.text)).filter(Boolean);
  const slides = [
    { role: "cover", kicker: template.typography.kicker.text, title, accent: "01" },
    { role: "hook", eyebrow: "THIS NOTE", text: clip(expressions[0] || chunks.shift() || title, 48), accent: "READ" }
  ];

  const availableInsightSlots = template.slidePolicy.maximum - slides.length - 1;
  chunks.slice(0, availableInsightSlots).forEach((text, index) => {
    slides.push({ role: "insight", eyebrow: `INSIGHT ${String(index + 1).padStart(2, "0")}`, text, accent: String(index + 2).padStart(2, "0") });
  });

  while (slides.length < template.slidePolicy.minimum - 1) {
    slides.push({ role: "breathing-room", eyebrow: "PAUSE", text: "把这一句留给自己。", accent: "—" });
  }

  slides.push({
    role: "ending",
    eyebrow: "KEEP READING",
    text: layout.callToAction,
    source: facts[0] ? `来源：${clip(facts[0], 34)}` : "SHUZHAI / READING NOTES",
    accent: "END"
  });

  return {
    template: { id: template.id, name: template.name, version: template.version, canvas: template.canvas, safeArea: template.safeArea, palette: template.palette },
    slides
  };
}
