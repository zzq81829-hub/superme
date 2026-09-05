/**
 * Direct Xiaohongshu Publisher via Playwright + logged-in Edge profile
 * Bypasses xhs-mcp entirely - uses the Gold chance account profile directly
 */
import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Clean lock files before launch
function cleanProfileLocks(profileDir) {
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"]) {
    try { fs.unlinkSync(path.join(profileDir, f)); } catch {}
  }
}

async function publish() {
  const pkgId = process.argv[2] || "shuzhai-xhs-kahneman-loss-20260903";
  const explicitAccount = process.argv[3] || null;

  // Load accounts config
  const accountsConfig = JSON.parse(fs.readFileSync(path.resolve(root, "data", "accounts.json"), "utf8")).accounts;

  // Load package
  const { getPackage, recordPublish } = await import("../src/content/store.js");
  const { buildXhsNote } = await import("../src/publish/xhs.js");
  const pkg = getPackage(pkgId);
  if (!pkg) { console.error("Package not found:", pkgId); process.exit(1); }
  const note = buildXhsNote(pkg);

  // Determine target account
  let targetAccount = null;
  if (explicitAccount) {
    targetAccount = Object.values(accountsConfig).find(a => 
      a.name.toLowerCase() === explicitAccount.toLowerCase() ||
      a.id.toLowerCase() === explicitAccount.toLowerCase() ||
      a.profileDir === explicitAccount
    );
  }
  if (!targetAccount) {
    if (pkg.project === "shuzhai") {
      targetAccount = accountsConfig.shuzhai; // good try
    } else if (pkg.project === "personal_ip") {
      targetAccount = accountsConfig.personal_ip; // 枳子8
    } else {
      targetAccount = accountsConfig.x_curation; // Gold chance (搬运X)
    }
  }

  const profileDir = path.resolve(root, "data", "profiles", targetAccount.profileDir);

  console.log("========================================");
  console.log("  小红书直发工具 (Direct Playwright)");
  console.log("========================================");
  console.log(`目标账号: ${targetAccount.name} (${targetAccount.type})`);
  console.log(`业务定位: ${targetAccount.role}`);
  console.log(`本地Profile: ${targetAccount.profileDir}`);
  console.log(`IP/地理属地: ${targetAccount.location} (${targetAccount.geolocation.latitude}, ${targetAccount.geolocation.longitude})`);
  console.log("标题:", note.title);
  console.log("图片:", note.images.length, "张");
  console.log("标签:", note.tags.join(", "));
  console.log("正文长度:", note.content.length, "字");
  console.log("========================================");

  // Validate account isolation pre-check BEFORE cleaning locks or launching browser
  const { validateAccountPipelineIsolation } = await import("../src/content/store.js");
  try {
    validateAccountPipelineIsolation(pkg, targetAccount);
  } catch (err) {
    console.error("❌ Account isolation violation:", err.message);
    process.exit(1);
  }

  cleanProfileLocks(profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
    geolocation: targetAccount.geolocation,
    permissions: ["geolocation"],
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate to creator publish page
    console.log("[1/6] 进入小红书创作者发布中心...");
    await page.goto("https://creator.xiaohongshu.com/publish/publish", {
      timeout: 30000, waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(4000);

    // Step 2: Click 上传图文 tab via JS (bypasses viewport issues)
    console.log("[2/6] 切换到【上传图文】模式...");
    await page.evaluate(() => {
      const spans = [...document.querySelectorAll("span")];
      const tab = spans.find(s => s.textContent.trim() === "上传图文");
      if (tab) tab.click();
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(root, "data", "content", "step2_tab.png") });
    console.log("     Tab 已切换，截图: data/content/step2_tab.png");

    // Step 3: Upload images
    console.log("[3/6] 上传", note.images.length, "张高清美术卡片...");
    const fileInputs = page.locator("input[type='file']");
    const fiCount = await fileInputs.count();
    console.log("     发现", fiCount, "个文件上传入口");
    // Use the last file input (image upload area, not video)
    const fileInput = fiCount > 1 ? fileInputs.nth(fiCount - 1) : fileInputs.first();
    await fileInput.setInputFiles(note.images);
    console.log("     等待图片上传完成...");
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(root, "data", "content", "step3_upload.png") });
    console.log("     上传截图: data/content/step3_upload.png");

    // Step 4: Fill title
    console.log("[4/6] 填写标题:", note.title);
    // Fill title via JS evaluate to bypass Vue input reactivity
    await page.evaluate((titleText) => {
      const inputs = [...document.querySelectorAll("input")];
      const titleInput = inputs.find(el => el.placeholder?.includes("标题") || el.maxLength > 0);
      if (titleInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(titleInput, titleText);
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        titleInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, note.title);
    await page.waitForTimeout(1000);

    // Step 5: Fill content via JS into the contenteditable div
    console.log("[5/6] 填写正文与标签...");
    const tagStr = note.tags.map(t => "#" + t).join(" ");
    const fullContent = note.content + "\n\n" + tagStr;
    await page.evaluate((text) => {
      // Find the main content textarea/contenteditable
      const editors = [...document.querySelectorAll("[contenteditable='true'], textarea")];
      const editor = editors.find(el => !el.closest(".d-input-input")) || editors[0];
      if (editor) {
        editor.focus();
        if (editor.tagName === "TEXTAREA") {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          nativeSetter.call(editor, text);
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          // contenteditable
          editor.innerText = text;
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
        }
      }
    }, fullContent);
    await page.waitForTimeout(2000);

    // Save pre-publish screenshot
    const ssDir = path.resolve(root, "data", "content");
    fs.mkdirSync(ssDir, { recursive: true });
    await page.screenshot({ path: path.join(ssDir, "pre_publish.png") });
    console.log("     预览截图已保存: data/content/pre_publish.png");

    // Step 6: Dismiss popup, then click 发布 button by exact coordinate
    console.log("[6/6] 关闭弹窗（如有）并点击【发布】按钮...");

    // Dismiss popup
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const dismiss = btns.find(b => b.textContent.includes("我知道了") || b.textContent.includes("知道了"));
      if (dismiss) dismiss.click();
    });
    await page.waitForTimeout(1500);

    // Get 发布 button exact position via JS, then click with real mouse
    const btnRect = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const pub = btns.find(b => b.textContent.trim() === "发布");
      if (!pub) return null;
      const r = pub.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    });
    console.log("     发布按钮坐标:", btnRect);

    if (btnRect && btnRect.y > 0) {
      await page.mouse.move(btnRect.x, btnRect.y);
      await page.waitForTimeout(300);
      await page.mouse.click(btnRect.x, btnRect.y);
      console.log("     已点击发布按钮（真实鼠标坐标点击）");
    } else {
      // Last resort: Tab key + Enter to submit
      console.log("     按钮坐标获取失败，尝试键盘提交...");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
    }

    // Wait for URL change confirming publish success (max 30s)
    console.log("     等待发布结果确认...");
    const beforeUrl = page.url();
    let published = false;
    try {
      await page.waitForFunction(
        (oldUrl) => window.location.href !== oldUrl,
        beforeUrl,
        { timeout: 30000 }
      );
      published = true;
      console.log("     ✅ 页面已跳转！URL:", page.url());
    } catch {
      console.log("     ⚠️ 30秒内未检测到跳转，当前URL:", page.url());
    }

    // Post-publish screenshot
    await page.screenshot({ path: path.join(ssDir, "post_publish.png"), fullPage: true });
    console.log("     发布后截图: data/content/post_publish.png");

    const result = { ok: published, title: note.title, publishedAt: new Date().toISOString(), finalUrl: page.url() };
    recordPublish(pkgId, result);
    if (published) {
      console.log("\n🎉🎉🎉 发布成功！《" + note.title + "》已上线！");
      console.log("最终页面:", page.url());
      try {
        const { upsertNote } = await import("../engine/intelligence/xhs/storage/repository.js");
        upsertNote({
          accountKey: targetAccount.profileDir,
          accountId: targetAccount.id,
          profileDir: targetAccount.profileDir,
          noteId: pkgId,
          title: note.title,
          publishTime: new Date().toISOString(),
          noteType: "normal",
          url: page.url()
        });
      } catch (err) {
        console.warn("Could not write to SQLite ledger:", err.message);
      }
    } else {
      console.log("\n⚠️ 发布状态不确定，请手动检查小红书账号");
    }

    await context.close();
    return result;
  } catch (err) {
    console.error("❌ 发布出错:", err.message);
    try { await page.screenshot({ path: path.join(root, "data", "content", "publish_error.png") }); } catch {}
    await context.close();
    process.exit(1);
  }
}

publish();
