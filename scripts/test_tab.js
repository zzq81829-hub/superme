import { chromium } from "playwright-core";
import path from "path";

async function test() {
  const profileDir = path.resolve(process.cwd(), "data", "profiles", "xhs_account_2");
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  await page.goto("https://creator.xiaohongshu.com/publish/publish", {
    timeout: 20000,
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(3000);

  // Click tab
  const tabs = page.getByText("上传图文");
  const count = await tabs.count();
  console.log("Count:", count);
  for (let i = 0; i < count; i++) {
    const isVis = await tabs.nth(i).isVisible();
    console.log("Tab", i, "visible:", isVis);
    if (isVis) {
      await tabs.nth(i).click();
      console.log("Clicked tab", i);
      break;
    }
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "data/content/tuwen_tab.png" });
  console.log("Screenshot saved to data/content/tuwen_tab.png");

  const fileInput = await page.locator("input[type='file']").count();
  console.log("File inputs count:", fileInput);

  await context.close();
}

test().catch(console.error);
