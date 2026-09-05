/**
 * 30-Minute Break-Rule Watcher & Auto-Publisher (破例运行30分钟自动发布守护)
 *
 * 1. Monitors Xiaohongshu login status.
 * 2. As soon as user scans QR code and logs in, immediately triggers publishApprovedPackage.
 */

import { getXhsLoginStatus, publishApprovedPackage, startXhsLoginWindow } from "../src/publish/xhs.js";
import { getPackage } from "../src/content/store.js";

const PKG_ID = "shuzhai-xhs-kahneman-loss-20260903";
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 3000;      // 3 seconds

async function main() {
  console.log(`[${new Date().toISOString()}] 🚀 破例30分钟发布守护已激活...`);
  console.log(`• 目标图文包: ${PKG_ID}`);
  
  const pkg = getPackage(PKG_ID);
  console.log(`• 标题: 《${pkg?.title}》`);
  console.log(`• 状态: ${pkg?.status} (${pkg?.approvalStatus})`);
  console.log(`• 图片数量: ${(pkg?.media || []).filter(m => m.kind === 'image').length} 张美术馆艺术油画卡片`);

  const startTime = Date.now();
  let promptShown = false;

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const status = await getXhsLoginStatus();
    if (status.loggedIn) {
      console.log(`\n[${new Date().toISOString()}] 🔑 检测到小红书账号已就绪，立即执行发布流水线...`);
      const result = await publishApprovedPackage(PKG_ID);
      console.log("• 发布返回结果:", result);
      if (result.ok) {
        console.log(`\n🎉🎉🎉 发布大成功！小红书图文笔记已正式上线！`);
      } else {
        console.log(`❌ 发布遇到问题: ${result.message || result.error}`);
      }
      return;
    }

    if (!promptShown) {
      console.log("⏳ 等待手机小红书 App 扫码登录中 (扫码后系统将自动秒发)...");
      promptShown = true;
    }

    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }

  console.log(`\n⏱️ 已达到 30 分钟破例窗口上限，停止等待。`);
}

main().catch(console.error);
