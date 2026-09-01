import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { getPhoneAccessToken } from "../src/phoneAccess.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = getPhoneAccessToken({
  tokenPath: path.join(root, "data", "phone-access-token"),
  reset: process.argv.includes("--reset")
});
const interfaces = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === "IPv4" && !item.internal);
const addresses = [...new Set(interfaces.map((item) => item.address))];

console.log("AI Founder OS 手机访问模式已启动（仅在你信任的家庭/个人 Wi‑Fi 使用）。");
if (!addresses.length) console.log("未发现局域网地址，请确认电脑已连接 Wi‑Fi。");
for (const address of addresses) {
  console.log(`固定入口: http://${address}:3210/phone`);
  console.log(`首次配对: http://${address}:3210/phone?access=${token}`);
}
console.log("配对后收藏 /phone 即可长期使用；关闭窗口只会停止服务，不会更换口令。");
console.log("如需更换口令，请运行: npm run start:phone:reset");

const child = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env: { ...process.env, AI_FOUNDER_OS_HOST: "0.0.0.0", AI_FOUNDER_OS_PHONE_TOKEN: token },
  stdio: "inherit",
  windowsHide: false,
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
