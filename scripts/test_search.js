import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-proxy-server"]
  });
  const page = await browser.newPage();
  console.log("Navigating to search_result for AI...");
  await page.goto("https://www.xiaohongshu.com/search_result?keyword=AI&source=web_search_result_notes", {
    waitUntil: "domcontentloaded",
    timeout: 15000
  });
  await page.waitForTimeout(4000);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("Body:\n", body);

  const cards = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll("section, .note-item, [class*='note']"));
    return list.map(c => ({ tag: c.tagName, className: c.className, text: c.innerText?.slice(0, 80) })).slice(0, 5);
  });
  console.log("Cards sample:", cards);

  await browser.close();
}

main().catch(console.error);
