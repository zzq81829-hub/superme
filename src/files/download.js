import fs from "fs";
import { peekPhoneAccessToken } from "../phoneAccess.js";
import { getFile, validateSafePath, computeFileHash } from "./registry.js";

export function resolveDownloadToken(req, options = {}) {
  const header = req.get("X-OS-Phone-Token");
  if (!header) return { token: null, error: "missing" };
  const envToken = process.env.AI_FOUNDER_OS_PHONE_TOKEN?.trim() || "";
  const stored = peekPhoneAccessToken(options);
  const activeToken = envToken || stored;
  if (!activeToken || header !== activeToken) return { token: header, error: "invalid" };
  return { token: header, error: null };
}

export function handleFileDownload(req, res, deps = {}) {
  const auth = resolveDownloadToken(req, deps.tokenOptions || {});
  if (auth.error === "missing") {
    return res.status(401).json({ error: "手机访问口令缺失 (Phone token is required for file download)" });
  }
  if (auth.error === "invalid") {
    return res.status(401).json({ error: "手机访问口令无效或已过期 (Invalid or expired phone token)" });
  }

  const lookup = deps.getFile || getFile;
  const file = lookup(req.params.id, deps.fileOptions || {});
  if (!file) {
    return res.status(404).json({ error: `未登记文件不能下载 (File not registered: ${req.params.id})` });
  }
  if (!file.verified) {
    return res.status(403).json({ error: "未验收文件不能标记为可发送 (Unverified file cannot be downloaded)" });
  }

  const projectRoot = deps.projectRoot || process.cwd();
  let safe;
  try {
    safe = validateSafePath(file.path, projectRoot);
  } catch (err) {
    return res.status(403).json({ error: `越权路径被拒绝: ${err.message}` });
  }

  if (!fs.existsSync(safe.absolutePath) || !fs.statSync(safe.absolutePath).isFile()) {
    return res.status(404).json({ error: "文件在磁盘上不存在" });
  }

  try {
    const currentHash = computeFileHash(safe.absolutePath);
    const registeredHash = file.hash || file.sha256;
    if (!registeredHash || currentHash !== registeredHash) {
      return res.status(409).json({ error: "文件内容已变化，拒绝下载 (File hash mismatch)" });
    }
  } catch {
    return res.status(404).json({ error: "文件无法读取" });
  }

  res.setHeader("Content-Type", file.mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
  return res.sendFile(safe.absolutePath);
}
