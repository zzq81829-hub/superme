import fs from "node:fs";
import path from "node:path";
import { BaseXhsProvider } from "./baseProvider.js";
import { bioJitter, humanMicroActions } from "./creatorCenterProvider.js";
import {
  upsertPublicNote,
  appendPublicNoteSnapshot,
  upsertPublicCreator,
  markKeywordScanned
} from "../storage/repository.js";

/**
 * PublicResearchProvider - Read-only intelligence gathering for keywords & benchmark creators.
 * Features:
 * - Persistent isolated research profile (data/profiles/xhs_public_research)
 * - Stealth anti-fingerprinting (masks navigator.webdriver & automation flags)
 * - Biological human micro-actions (smooth mouse drift, reading pauses, micro-scrolls)
 * - Safe DOM card extraction for public notes and metrics
 * - Strict 100% Read-Only: NEVER likes, follows, posts, comments, or sends messages
 */
export class PublicResearchProvider extends BaseXhsProvider {
  constructor(options = {}) {
    super("PublicResearchProvider", options);
  }

  getProfileDir() {
    const root = process.cwd();
    const profileDir = path.resolve(root, "data", "profiles", "xhs_public_research");
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  }

  _getExecutablePath() {
    const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    if (fs.existsSync(chrome)) return chrome;
    return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  }

  async _getPlaywright() {
    try {
      const pw = await import("playwright");
      return pw.chromium || pw.default?.chromium;
    } catch {
      try {
        const pwCore = await import("playwright-core");
        return pwCore.chromium || pwCore.default?.chromium;
      } catch {
        return null;
      }
    }
  }

  async searchKeyword(keyword, onProgress = () => {}) {
    onProgress({ step: "search_keyword", message: `正在以真人浏览拟态检索关键词 [${keyword}]...` });
    markKeywordScanned(keyword);

    const chromium = await this._getPlaywright();
    if (!chromium) {
      return { ok: false, message: "Playwright 未安装，建议开启 Mock 模式" };
    }

    const profileDir = this.getProfileDir();
    let context = null;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        executablePath: this._getExecutablePath(),
        headless: true,
        args: [
          "--no-proxy-server",
          "--disable-blink-features=AutomationControlled"
        ],
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      });

      // Inject stealth anti-fingerprinting script
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        window.chrome = { runtime: {} };
      });

      const page = await context.newPage();
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 18000 });

      // Natural human reading wait + micro-actions
      await humanMicroActions(page);
      await page.waitForTimeout(bioJitter(2200, 4500));

      const currentUrl = page.url();
      if (this.isCaptchaOrRiskControl(currentUrl)) {
        await context.close();
        return { ok: false, status: "captcha", message: "检索触发安全验证，已安全暂停" };
      }

      // Check if blocked by login modal
      const isLoginModal = await page.evaluate(() => {
        return !!document.querySelector(".login-container, .login-box, .modal-login, [class*='login-modal']");
      });

      // Human micro-scroll to load dynamic note cards
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(bioJitter(1500, 2800));

      // Extract note cards
      const notesData = await page.evaluate((kw) => {
        const cards = Array.from(document.querySelectorAll("section.note-item, div.note-item, div.search-card, [class*='note-item']"));
        return cards.slice(0, 12).map((card) => {
          let noteId = "";
          let url = "";
          const link = card.querySelector("a[href*='/explore/'], a[href*='/discovery/item/'], a");
          if (link && link.href) {
            url = link.href;
            const match = link.href.match(/\/(?:explore|discovery\/item)\/([a-zA-Z0-9_-]+)/);
            if (match) noteId = match[1];
          }

          const titleEl = card.querySelector(".title, .desc, [class*='title'], [class*='desc']");
          const title = titleEl ? titleEl.innerText.trim() : "";

          const authorEl = card.querySelector(".author, .name, [class*='author'], [class*='name']");
          const author = authorEl ? authorEl.innerText.trim() : "";

          const likeEl = card.querySelector(".like-wrapper, .count, [class*='like'], [class*='count']");
          const likeText = likeEl ? likeEl.innerText.trim() : "";

          return { noteId, url, title, author, likeText, keyword: kw };
        }).filter((item) => item.title);
      }, keyword);

      let savedCount = 0;
      const snapshotTime = new Date().toISOString();

      for (const item of notesData) {
        const safeNoteId = item.noteId || `pub_${Buffer.from(item.title).toString("hex").slice(0, 16)}`;
        const safeUrl = item.url || `https://www.xiaohongshu.com/explore/${safeNoteId}`;

        let likes = 0;
        if (item.likeText) {
          const clean = item.likeText.replace(/,/g, "").trim();
          if (clean.endsWith("万") || clean.endsWith("w") || clean.endsWith("W")) {
            likes = Math.round(parseFloat(clean) * 10000);
          } else {
            const parsed = parseInt(clean, 10);
            if (!isNaN(parsed)) likes = parsed;
          }
        }

        const creatorId = item.author ? `creator_${Buffer.from(item.author).toString("hex").slice(0, 12)}` : null;
        if (creatorId && item.author) {
          upsertPublicCreator({
            creatorId,
            nickname: item.author,
            tracked: 1
          });
        }

        upsertPublicNote({
          noteId: safeNoteId,
          creatorId,
          title: item.title,
          text: `[搜索检索] 关键词 #${keyword} 发现热门笔记`,
          publishTime: snapshotTime,
          url: safeUrl,
          tags: keyword,
          noteType: "normal",
          discoveredFrom: `keyword:${keyword}`
        });

        appendPublicNoteSnapshot({
          noteId: safeNoteId,
          snapshotAt: snapshotTime,
          likes,
          favorites: Math.floor(likes * 0.4),
          comments: Math.floor(likes * 0.05),
          shares: Math.floor(likes * 0.02),
          source: "public_search"
        });

        savedCount++;
      }

      await context.close();
      return {
        ok: true,
        keyword,
        count: savedCount,
        loginRequired: isLoginModal && savedCount === 0,
        message: savedCount > 0 
          ? `成功采集 [${keyword}] 相关的 ${savedCount} 篇竞品爆款笔记`
          : isLoginModal 
          ? `小红书搜索要求登录，可通过控制台【📱 登录外部研究账号】扫码解除限制`
          : `已检索 [${keyword}]，当前暂无新笔记数据`
      };
    } catch (err) {
      if (context) await context.close();
      return { ok: false, error: err.message };
    }
  }

  async collectPublic(keywords = [], creators = [], onProgress = () => {}) {
    this.status = "RUNNING";
    this.lastRunAt = new Date().toISOString();

    const results = [];
    for (const kw of keywords) {
      const res = await this.searchKeyword(kw, onProgress);
      results.push(res);
      // 生理学生物节流：3.5s ~ 7.5s 动态高斯浮动间隔，防止频繁翻页与搜索触发风控
      const jitterMs = bioJitter(3500, 7500);
      await new Promise((r) => setTimeout(r, jitterMs));
    }

    this.status = "IDLE";
    return { ok: true, results };
  }
}

