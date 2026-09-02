import fs from "node:fs";
import path from "node:path";
import { BaseXhsProvider } from "./baseProvider.js";
import {
  getAccount,
  updateAccountStatus,
  upsertNote,
  appendNoteSnapshot
} from "../storage/repository.js";

/**
 * Generates human-like variable delay with natural Gaussian/bell-curve variance
 * (Central limit theorem creates high entropy, preventing bot detection)
 */
export function bioJitter(minMs, maxMs) {
  const r1 = Math.random();
  const r2 = Math.random();
  const factor = (r1 + r2) / 2;
  return Math.floor(minMs + factor * (maxMs - minMs));
}

/**
 * Emulates natural human browsing behaviors:
 * 1. Smooth multi-step mouse drift
 * 2. Physiological reading micro-scrolls
 * 3. Occasional subtle counter-scrolls (simulating human eye tracking)
 */
async function humanMicroActions(page) {
  try {
    const x = Math.floor(250 + Math.random() * 450);
    const y = Math.floor(180 + Math.random() * 320);
    await page.mouse.move(x, y, { steps: Math.floor(4 + Math.random() * 7) });

    const scrollDelta = Math.floor(120 + Math.random() * 240);
    await page.mouse.wheel(0, scrollDelta);
    await page.waitForTimeout(bioJitter(250, 550));

    if (Math.random() < 0.35) {
      await page.mouse.wheel(0, -Math.floor(scrollDelta * 0.35));
      await page.waitForTimeout(bioJitter(180, 420));
    }
  } catch {}
}

/**
 * CreatorCenterProvider - Manages 3 distinct accounts with isolated Playwright persistent profiles.
 * References architectural patterns from orangexie05/creator-platform-data:
 * - Persistent profile per account
 * - Strict multi-account isolation (no shared cookies/tokens)
 * - Safe snapshot upsert
 * - Graceful handling of QR-code and CAPTCHA
 */
export class CreatorCenterProvider extends BaseXhsProvider {
  constructor(options = {}) {
    super("CreatorCenterProvider", options);
    this.activeBrowserContexts = new Map();
  }

  getProfileDir(accountKey) {
    const root = process.cwd();
    const profileDir = path.resolve(root, "data", "profiles", accountKey);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  }

  _getExecutablePath(accountKey) {
    if (accountKey === "xhs_account_2") {
      const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
      if (fs.existsSync(edge)) return edge;
    }
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

  async checkAccountLogin(accountKey) {
    const chromium = await this._getPlaywright();
    if (!chromium) {
      return { ok: false, status: "playwright_not_installed", message: "Playwright 未安装，可通过 Mock 模式测试" };
    }

    const profileDir = this.getProfileDir(accountKey);
    let context = null;

    try {
      context = await chromium.launchPersistentContext(profileDir, {
        executablePath: this._getExecutablePath(accountKey),
        headless: true,
        args: ["--no-proxy-server"],
        viewport: { width: 1280, height: 800 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      });

      const page = await context.newPage();
      await page.goto("https://creator.xiaohongshu.com/new/home", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2500); // 必须等待 SPA 客户端鉴权与可能的 401 重定向完成

      const currentUrl = page.url();
      if (this.isLoginExpired(currentUrl)) {
        updateAccountStatus(accountKey, "need_login", "需要扫码登录");
        await context.close();
        return { ok: false, status: "need_login", message: "尚未登录或登录已过期，需扫码登录" };
      }

      if (this.isCaptchaOrRiskControl(currentUrl) || (await page.locator("text=请完成安全验证").count()) > 0) {
        updateAccountStatus(accountKey, "captcha", "触发安全验证");
        await context.close();
        return { ok: false, status: "captcha", message: "检测到安全验证码，暂停采集以防风控" };
      }

      updateAccountStatus(accountKey, "logged_in", null, true);
      await context.close();
      return { ok: true, status: "logged_in" };
    } catch (err) {
      if (context) await context.close();
      updateAccountStatus(accountKey, "error", err.message);
      return { ok: false, status: "error", message: err.message };
    }
  }

  async collectAccount(accountKey, onProgress = () => {}) {
    this.status = "RUNNING";
    this.lastRunAt = new Date().toISOString();
    onProgress({ step: "check_env", message: `[${accountKey}] 检查环境与账号状态...` });

    const chromium = await this._getPlaywright();
    if (!chromium) {
      this.status = "ERROR";
      const err = new Error("Playwright 运行环境未就绪。请使用 Mock 模式或安装 Playwright");
      updateAccountStatus(accountKey, "error", err.message);
      throw err;
    }

    const profileDir = this.getProfileDir(accountKey);
    let context = null;

    try {
      onProgress({ step: "launch_browser", message: `[${accountKey}] 启动隔离浏览器 profile...` });
      context = await chromium.launchPersistentContext(profileDir, {
        executablePath: this._getExecutablePath(accountKey),
        headless: true,
        args: ["--no-proxy-server"],
        viewport: { width: 1440, height: 900 }
      });

      const page = await context.newPage();
      onProgress({ step: "navigate_creator", message: `[${accountKey}] 访问创作者服务中心...` });
      await page.goto("https://creator.xiaohongshu.com/new/note-manager", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(2500); // 必须等待 SPA 客户端鉴权与可能的 401 重定向完成

      const url = page.url();
      if (this.isLoginExpired(url)) {
        this.status = "NEED_LOGIN";
        const msg = `账号 [${accountKey}] 尚未扫码登录（或登录已失效）。请在控制台点击【📱 扫码登录】或在桌面运行对应 .bat 脚本扫码！`;
        updateAccountStatus(accountKey, "need_login", msg);
        await context.close();
        throw new Error(msg);
      }

      if (this.isCaptchaOrRiskControl(url)) {
        this.status = "NEED_VERIFICATION";
        updateAccountStatus(accountKey, "captcha", "触发安全验证码");
        await context.close();
        throw new Error("触发小红书安全验证，已安全暂停");
      }

      onProgress({ step: "reading_notes", message: `[${accountKey}] 正在解析创作者笔记时序数据...` });

      let totalCollected = 0;
      let pageNum = 1;
      const maxPages = 15; // 安全翻页上限，杜绝死循环

      while (pageNum <= maxPages) {
        // 动态生理学微动作与高斯浮动等待 (1.8s ~ 3.6s)
        await humanMicroActions(page);
        await page.waitForTimeout(bioJitter(1800, 3600));

        const currentUrl = page.url();
        if (this.isLoginExpired(currentUrl)) {
          this.status = "NEED_LOGIN";
          const msg = `账号 [${accountKey}] 尚未扫码登录（或登录已失效）。请在控制台点击【📱 扫码登录】或在桌面运行对应 .bat 脚本扫码！`;
          updateAccountStatus(accountKey, "need_login", msg);
          await context.close();
          throw new Error(msg);
        }
        if (this.isCaptchaOrRiskControl(currentUrl)) {
          this.status = "NEED_VERIFICATION";
          updateAccountStatus(accountKey, "captcha", "触发安全验证码");
          await context.close();
          throw new Error("触发小红书安全验证，已安全暂停");
        }

        const cardsData = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll("div.note-card"));
          return cards.map((card) => {
            let noteId = "";
            try {
              const imp = card.getAttribute("data-impression");
              if (imp) {
                const parsed = JSON.parse(imp);
                noteId = parsed?.noteTarget?.value?.noteId || "";
              }
            } catch {}

            const coverImg = card.querySelector("img");
            const cover = coverImg ? coverImg.src : "";

            const body = card.querySelector(".note-card__body") || card;
            const text = body.innerText || "";
            const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);

            return { noteId, cover, lines };
          });
        });

        if (cardsData.length === 0) {
          if (pageNum === 1) {
            await page.waitForTimeout(2500);
            const retryCards = await page.evaluate(() => document.querySelectorAll("div.note-card").length);
            if (retryCards === 0) break;
            continue;
          } else {
            break;
          }
        }

        const snapshotTime = new Date().toISOString();

        for (const item of cardsData) {
          if (!item.lines || item.lines.length < 2) continue;

          let title = item.lines[0];
          let dateStr = item.lines[1];
          let numLines = item.lines.slice(2);

          // 兼容“仅自己可见”、“审核中”、“未通过”、“置顶”等状态标签
          if (["仅自己可见", "审核中", "未通过", "置顶"].includes(title) && item.lines.length >= 3) {
            title = item.lines[1];
            dateStr = item.lines[2];
            numLines = item.lines.slice(3);
          }

          const safeNoteId = item.noteId || `note_${accountKey}_${Buffer.from(title).toString("hex").slice(0, 16)}`;

          // 官方后台指标序列：[播放/阅读, 分享, 点赞, 收藏, 评论]
          const nums = numLines.map((s) => {
            const clean = s.replace(/,/g, "").trim();
            if (clean.endsWith("万") || clean.endsWith("w") || clean.endsWith("W")) {
              return Math.round(parseFloat(clean) * 10000);
            }
            const n = parseInt(clean, 10);
            return isNaN(n) ? 0 : n;
          });

          const views = nums[0] || 0;
          const shares = nums[1] || 0;
          const likes = nums[2] || 0;
          const favorites = nums[3] || 0;
          const comments = nums[4] || 0;

          // 1. 记录笔记元数据
          upsertNote({
            accountKey,
            noteId: safeNoteId,
            title,
            publishTime: dateStr,
            noteType: "normal",
            url: `https://www.xiaohongshu.com/explore/${safeNoteId}`
          });

          // 2. 追加时序快照 (Append-only)
          appendNoteSnapshot({
            accountKey,
            noteId: safeNoteId,
            snapshotAt: snapshotTime,
            impressions: views,
            views,
            likes,
            favorites,
            comments,
            shares,
            source: "creator_center"
          });

          totalCollected++;
        }

        onProgress({
          step: "reading_notes",
          message: `[${accountKey}] 第 ${pageNum} 页已解析，当前累计收录 ${totalCollected} 篇笔记...`
        });

        // 检查是否有下一页
        const hasNextPage = await page.evaluate(() => {
          const nextBtn = document.querySelector(".btn-next, li.ant-pagination-next, [class*='next']:not([class*='disabled'])");
          if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains("disabled") && !nextBtn.classList.contains("ant-pagination-disabled")) {
            nextBtn.click();
            return true;
          }
          return false;
        });

        if (!hasNextPage) break;
        pageNum++;
        // 动态生理学翻页行为仿真：微滚动 + 2.4s ~ 5.2s 动态高斯浮动间隔
        await humanMicroActions(page);
        await page.waitForTimeout(bioJitter(2400, 5200));
      }

      onProgress({ step: "complete", message: `[${accountKey}] 全量采集完成，共沉淀 ${totalCollected} 篇笔记数据` });
      updateAccountStatus(accountKey, "logged_in", null, true);
      this.status = "IDLE";
      await context.close();
      return { ok: true, accountKey, collected: totalCollected };
    } catch (err) {
      if (context) await context.close();
      this.status = "ERROR";
      let userMsg = err.message;
      if (err.message.includes("closed") || err.message.includes("exitCode=21") || err.message.includes("Target page")) {
        userMsg = "独立浏览器尚未关闭或仍在释放锁。请在扫码完成后先关闭该账号的浏览器窗口，再点击【⚡ 采集数据】";
      }
      this.lastError = userMsg;
      updateAccountStatus(accountKey, "error", userMsg);
      throw new Error(userMsg);
    }
  }
}
