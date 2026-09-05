import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Read-scope policy. The founder grants all workers broad READ access to the
// machine, with two carve-outs (privacy and money) that must never be read.
// This is injected into every dispatched task prompt by buildPrompt, so every
// worker receives the same boundary.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../..");
const defaultScopePath = path.join(root, "founder_os", "READ_SCOPE.md");

// Fallback used when the editable file is missing, so the boundary is never
// silently dropped from the prompt.
const FALLBACK_SCOPE = [
  "READ SCOPE (读取权限边界):",
  "可以读取本机任意文件与目录，用于完成创始人指派的任务。但禁止读取以下两类内容：",
  "1. 隐私 (Privacy)：密钥/Token/密码/私钥(.ssh、*.pem、.env 密钥)、浏览器历史与 Cookie、私人聊天/通讯录/私人照片、身份与医疗信息。",
  "2. 金额 (Money)：银行卡号/支付密码/支付凭证、账单与流水、账户余额明细、财务税务文件(除非创始人明确要求)。",
  "这是「读取」授权，不含删除/修改/发布/付费(仍走一级审批与成本守卫)。",
  "遇到无法判断是否隐私/金额的文件，先停手询问，不读。读到的敏感内容不得写入报告或外传。"
].join("\n");

export function getReadScopePath(options = {}) {
  return options.scopePath || process.env.READ_SCOPE_FILE || defaultScopePath;
}

export function getReadScope(options = {}) {
  const file = getReadScopePath(options);
  let content = "";
  let exists = fs.existsSync(file);
  if (exists) {
    try {
      content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
    } catch {
      content = "";
    }
  }
  if (!content) {
    return { path: file, content: FALLBACK_SCOPE, exists: false, fallback: true };
  }
  return { path: file, content, exists: true, fallback: false };
}
