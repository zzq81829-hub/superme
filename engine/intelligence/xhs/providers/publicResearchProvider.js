import { BaseXhsProvider } from "./baseProvider.js";
import {
  upsertPublicNote,
  appendPublicNoteSnapshot,
  markKeywordScanned
} from "../storage/repository.js";

/**
 * PublicResearchProvider - Read-only intelligence gathering for keywords & benchmark creators.
 * References Yht20927/xiaohongshu-cli architecture:
 * - Search by keyword
 * - Creator public notes
 * - Strict 100% Read-Only: NEVER likes, follows, posts, comments, or sends messages
 */
export class PublicResearchProvider extends BaseXhsProvider {
  constructor(options = {}) {
    super("PublicResearchProvider", options);
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
    onProgress({ step: "search_keyword", message: `正在检索关键词 [${keyword}]...` });
    markKeywordScanned(keyword);

    const chromium = await this._getPlaywright();
    if (!chromium) {
      return { ok: false, message: "Playwright 未安装，建议开启 Mock 模式" };
    }

    let browser = null;
    try {
      const exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
      browser = await chromium.launch({
        executablePath: exe,
        headless: true,
        args: ["--no-proxy-server"]
      });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      });
      const page = await context.newPage();

      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

      if (this.isCaptchaOrRiskControl(page.url())) {
        await browser.close();
        return { ok: false, status: "captcha", message: "搜索触发平台验证码，已安全跳过" };
      }

      await browser.close();
      return { ok: true, keyword, count: 0 };
    } catch (err) {
      if (browser) await browser.close();
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
      // Gentle pacing - sleep 1s between keyword queries to protect from rate limits
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.status = "IDLE";
    return { ok: true, results };
  }
}
