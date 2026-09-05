import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function cleanProfileLocks(profileDir) {
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"]) {
    try { fs.unlinkSync(path.join(profileDir, f)); } catch {}
  }
}

async function checkAccount(acc) {
  const profileDir = path.resolve(root, "data", "profiles", acc);
  cleanProfileLocks(profileDir);
  console.log(`\n=== Testing ${acc} ===`);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
    geolocation: { latitude: 24.479834, longitude: 118.089425 }, // 厦门市
    permissions: ["geolocation"],
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN"
  });

  const page = await context.newPage();
  try {
    console.log(`[${acc}] Navigating to creator center publish page...`);
    await page.goto("https://creator.xiaohongshu.com/publish/publish", {
      timeout: 35000,
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`[${acc}] Final URL: ${url}`);

    const ssPath = path.resolve(root, "data", "content", `check_${acc}.png`);
    await page.screenshot({ path: ssPath });
    console.log(`[${acc}] Screenshot saved to ${ssPath}`);

    // Check visible text for account username
    const bodySnippet = await page.evaluate(() => {
      // Find elements in header or top-right
      const allText = document.body.innerText;
      return allText.slice(0, 400).replace(/\n+/g, " | ");
    });
    console.log(`[${acc}] Page text snippet: ${bodySnippet}`);
  } catch (e) {
    console.error(`[${acc}] Error: ${e.message}`);
  } finally {
    await context.close();
  }
}

async function run() {
  for (const acc of ["xhs_account_1", "xhs_account_2", "xhs_account_3"]) {
    await checkAccount(acc);
  }
}

run();
