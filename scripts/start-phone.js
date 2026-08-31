import crypto from "crypto";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = crypto.randomBytes(18).toString("base64url");
const interfaces = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === "IPv4" && !item.internal);
const addresses = [...new Set(interfaces.map((item) => item.address))];

console.log("AI Founder OS 手机访问模式已启动（仅在你信任的家庭/个人 Wi‑Fi 使用）。");
if (!addresses.length) console.log("未发现局域网地址，请确认电脑已连接 Wi‑Fi。");
for (const address of addresses) console.log(`手机打开: http://${address}:3210/?access=${token}`);
console.log("关闭此窗口后，手机访问口令立即失效。");

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
