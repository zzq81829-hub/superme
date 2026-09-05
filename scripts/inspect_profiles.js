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

async function inspectProfile(acc) {
  const profileDir = path.resolve(root, "data", "profiles", acc);
  cleanProfileLocks(profileDir);
  console.log(`\n========================================`);
  console.log(`Checking profile: ${acc}`);
  console.log(`========================================`);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
    geolocation: { latitude: 24.479834, longitude: 118.089425 }, // 福建厦门
    permissions: ["geolocation"],
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  try {
    console.log(`[${acc}] Navigating to creator.xiaohongshu.com/publish/publish ...`);
    await page.goto("https://creator.xiaohongshu.com/publish/publish", {
      timeout: 45000,
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(6000);

    const ssPath = path.resolve(root, "data", "content", `inspect_${acc}.png`);
    await page.screenshot({ path: ssPath });
    console.log(`[${acc}] Screenshot saved to: data/content/inspect_${acc}.png`);

    // Look for user nickname in page
    const nickname = await page.evaluate(() => {
      // Find header elements
      const elements = [...document.querySelectorAll("*")];
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text && (text.includes("good try") || text.includes("Gold chance") || el.className?.includes?.("name"))) {
          return { class: el.className, text: text.slice(0, 100) };
        }
      }
      return null;
    });

    console.log(`[${acc}] Nickname match:`, nickname);
    console.log(`[${acc}] Current URL:`, page.url());
  } catch (err) {
    console.error(`[${acc}] Error:`, err.message);
  } finally {
    await context.close();
  }
}

async function main() {
  const target = process.argv[2];
  if (target) {
    await inspectProfile(target);
  } else {
    for (const acc of ["xhs_account_1", "xhs_account_2", "xhs_account_3"]) {
      await inspectProfile(acc);
    }
  }
}

main();
