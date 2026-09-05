import { chromium } from "playwright-core";
import path from "path";

async function main() {
  const profileDir = path.resolve(process.cwd(), "data", "profiles", "xhs_account_2");
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  console.log("Navigating to search_result with logged-in context...");
  await page.goto("https://www.xiaohongshu.com/search_result?keyword=AI&source=web_search_result_notes", {
    waitUntil: "domcontentloaded",
    timeout: 15000
  });
  await page.waitForTimeout(4000);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Body:\n", body);

  const cards = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll("section, .note-item, [class*='note']"));
    return list.map(c => ({ tag: c.tagName, className: c.className, text: c.innerText?.slice(0, 80) })).slice(0, 5);
  });
  console.log("Cards found:", cards.length);
  cards.forEach(c => console.log("Card:", c));

  await context.close();
}

main().catch(console.error);
