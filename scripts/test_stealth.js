import { chromium } from "playwright-core";
import path from "path";

async function main() {
  const profileDir = path.resolve(process.cwd(), "data", "profiles", "xhs_account_2");
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true, // test if non-headless makes a difference or stealth args
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--no-proxy-server",
      "--disable-blink-features=AutomationControlled"
    ],
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  console.log("Navigating with stealth args...");
  await page.goto("https://www.xiaohongshu.com/search_result?keyword=AI&source=web_search_result_notes", {
    waitUntil: "domcontentloaded",
    timeout: 15000
  });
  await page.waitForTimeout(4000);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("Body:\n", body);

  await context.close();
}

main().catch(console.error);
