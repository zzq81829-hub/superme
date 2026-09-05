import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { getLocalTool } from "../tools/localTools.js";
import { getPackage, recordPublish, PipelineRoutingError } from "../content/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const TITLE_MAX = 20;
const CONTENT_MAX = 1000;
const DEFAULT_PORT = 18060;
const MCP_EXE = "xiaohongshu-mcp-windows-amd64.exe";
const LOGIN_EXE = "xiaohongshu-login-windows-amd64.exe";

let mcpChild = null;

export function getXhsMcpDir() {
  const shuzhai = getLocalTool("shuzhai");
  if (shuzhai?.path) return path.join(shuzhai.path, "tools", "xhs-mcp");
  return path.join(root, "..", "工作流", "tools", "xhs-mcp");
}

export function parseXhsCaption(body = "", fallbackTitle = "") {
  const text = String(body || "").replace(/\r\n/g, "\n").trim();
  let title = "";
  let content = text;

  const titleMatch = text.match(/#\s*标题\s*\n+([\s\S]*?)(?=\n+#\s*正文|\n+#|$)/);
  if (titleMatch) title = titleMatch[1].trim().split("\n")[0].trim();

  const bodyMatch = text.match(/#\s*正文\s*\n+([\s\S]*)/);
  if (bodyMatch) content = bodyMatch[1].trim();

  if (!title) title = String(fallbackTitle || "").trim();

  const tags = [];
  const tagRe = /#([^\s#]+)/g;
  let match;
  while ((match = tagRe.exec(content))) {
    const tag = match[1].replace(/[.,，。！？!?:：]/g, "").trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  content = content.replace(/(?:\n|^)[ \t]*(?:#[^\s#]+(?:[ \t]+#[^\s#]+)*)[ \t]*$/g, "").trim();

  return { title, content, tags };
}

export function clipXhsTitle(title) {
  return [...String(title || "").replace(/\s+/g, " ").trim()].slice(0, TITLE_MAX).join("");
}

export function clipXhsContent(content) {
  return [...String(content || "").trim()].slice(0, CONTENT_MAX).join("");
}

function captionSource(pkg, rootDir) {
  if (String(pkg.body || "").trim()) return pkg.body;
  const doc = (pkg.media || []).find((m) => /发布文案\.md$/i.test(String(m.path || "")));
  if (!doc?.path) return "";
  const file = path.isAbsolute(doc.path) ? doc.path : path.resolve(rootDir, doc.path);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

export function buildXhsNote(pkg, rootDir = root) {
  const parsed = parseXhsCaption(captionSource(pkg, rootDir), pkg.title);
  const images = (pkg.media || [])
    .filter((m) => m.kind === "image" && m.path)
    .map((m) => (path.isAbsolute(m.path) ? m.path : path.resolve(rootDir, m.path)))
    .filter((file) => fs.existsSync(file));

  return {
    title: clipXhsTitle(parsed.title),
    content: clipXhsContent(parsed.content),
    images,
    tags: parsed.tags
  };
}

function cookiesPath(mcpDir = getXhsMcpDir()) {
  return path.join(mcpDir, "cookies.json");
}

export function cookiesLookLoggedIn(mcpDir = getXhsMcpDir()) {
  try {
    const data = JSON.parse(fs.readFileSync(cookiesPath(mcpDir), "utf8"));
    return Array.isArray(data.cookies) && data.cookies.length > 0;
  } catch {
    return false;
  }
}

function httpJson(method, url, body = null, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function mcpHealth(baseUrl) {
  try {
    const res = await httpJson("GET", `${baseUrl}/health`, null, 3000);
    return res.status >= 200 && res.status < 500;
  } catch {
    try {
      const res = await httpJson("GET", `${baseUrl}/api/v1/login/status`, null, 3000);
      return res.status >= 200 && res.status < 500;
    } catch {
      return false;
    }
  }
}

export async function ensureXhsMcp(options = {}) {
  const mcpDir = options.mcpDir || getXhsMcpDir();
  const port = options.port || DEFAULT_PORT;
  const baseUrl = options.baseUrl || `http://127.0.0.1:${port}`;
  if (await mcpHealth(baseUrl)) return { ok: true, baseUrl, alreadyRunning: true };

  const exe = path.join(mcpDir, MCP_EXE);
  if (!fs.existsSync(exe)) {
    return { ok: false, error: "xhs_mcp_missing", message: `找不到小红书 MCP：${exe}` };
  }

  if (!mcpChild || mcpChild.killed) {
    const cleanEnv = { ...process.env };
    delete cleanEnv.HTTP_PROXY;
    delete cleanEnv.HTTPS_PROXY;
    delete cleanEnv.ALL_PROXY;
    delete cleanEnv.http_proxy;
    delete cleanEnv.https_proxy;
    delete cleanEnv.all_proxy;
    cleanEnv.NO_PROXY = "*";
    cleanEnv.no_proxy = "*";

    mcpChild = spawn(exe, ["-headless=true", `-port=:${port}`], {
      cwd: mcpDir,
      windowsHide: true,
      stdio: "ignore",
      env: cleanEnv
    });
    mcpChild.on("exit", () => { mcpChild = null; });
  }

  const deadline = Date.now() + (options.startTimeoutMs || 20000);
  while (Date.now() < deadline) {
    if (await mcpHealth(baseUrl)) return { ok: true, baseUrl, alreadyRunning: false };
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, error: "xhs_mcp_not_ready", message: "小红书 MCP 启动超时。首次会下载无头浏览器，稍后重试。" };
}

function readLoggedIn(json) {
  const data = json?.data && typeof json.data === "object" ? json.data : json || {};
  if (data.is_logged_in === true || data.logged_in === true || data.isLoggedIn === true) return true;
  if (data.is_logged_in === false || data.logged_in === false || data.isLoggedIn === false) return false;
  if (json?.success === true && (data.username || data.user_id)) return true;
  return null;
}

export async function getXhsLoginStatus(options = {}) {
  const mcpDir = options.mcpDir || getXhsMcpDir();
  const port = options.port || DEFAULT_PORT;
  const baseUrl = options.baseUrl || `http://127.0.0.1:${port}`;
  const cookieLogin = cookiesLookLoggedIn(mcpDir);
  const running = await mcpHealth(baseUrl);

  if (!running && !options.start) {
    return { ok: true, loggedIn: cookieLogin, mcp: false, cookies: cookieLogin };
  }

  const mcp = running ? { ok: true, baseUrl } : await ensureXhsMcp(options);
  if (!mcp.ok) {
    return { ok: false, loggedIn: cookieLogin, ...mcp };
  }

  try {
    const res = await httpJson("GET", `${mcp.baseUrl}/api/v1/login/status`, null, 8000);
    const flagged = readLoggedIn(res.json);
    const loggedIn = flagged == null ? cookieLogin : flagged;
    const data = res.json?.data || res.json || {};
    return {
      ok: true,
      loggedIn,
      username: data.username || data.nickname || null,
      mcp: true,
      cookies: cookieLogin
    };
  } catch (error) {
    return { ok: true, loggedIn: cookieLogin, mcp: false, cookies: cookieLogin, message: error.message };
  }
}

export async function getXhsLoginQr(options = {}) {
  const mcp = await ensureXhsMcp(options);
  if (!mcp.ok) return mcp;
  try {
    const res = await httpJson("GET", `${mcp.baseUrl}/api/v1/login/qrcode`, null, 20000);
    const data = res.json?.data || res.json || {};
    const img = data.img || data.image || data.qrcode || data.qr_code || data.base64;
    if (!img) return { ok: false, error: "qr_unavailable", fallback: "login_exe", message: "MCP 未返回二维码" };
    const src = String(img).startsWith("data:") ? img : `data:image/png;base64,${img}`;
    return { ok: true, img: src, timeout: data.timeout || null };
  } catch (error) {
    return { ok: false, error: "qr_unavailable", fallback: "login_exe", message: error.message };
  }
}

export function startXhsLoginWindow(options = {}) {
  const mcpDir = options.mcpDir || getXhsMcpDir();
  const exe = path.join(mcpDir, LOGIN_EXE);
  if (!fs.existsSync(exe)) {
    return { ok: false, error: "xhs_login_missing", message: `找不到登录工具：${exe}` };
  }
  spawn(exe, [], { cwd: mcpDir, detached: true, windowsHide: false, stdio: "ignore" }).unref();
  return { ok: true, method: "login_exe" };
}

export function resolvePublisherAccount(pkg, options = {}) {
  let accountsConfig = null;
  const customFile = options.accountsFile || path.resolve(options.rootDir || root, "data", "accounts.json");
  if (fs.existsSync(customFile)) {
    try {
      accountsConfig = JSON.parse(fs.readFileSync(customFile, "utf8")).accounts;
    } catch {}
  }
  if (!accountsConfig) {
    accountsConfig = {
      shuzhai: { id: "shuzhai", name: "good try", type: "社科书籍号", role: "认知资产 / 深度拆书 / 决策清单", profileDir: "xhs_account_1" },
      x_curation: { id: "x_curation", name: "Gold chance", type: "搬运X号", role: "海外信息雷达 / 信息差 / 筛选与更正", profileDir: "xhs_account_2" },
      personal_ip: { id: "personal_ip", name: "枳子8", type: "个人IP号", role: "创始人人设 / 商业思考 / 实践复盘 / 创业闭环", profileDir: "xhs_account_3" }
    };
  }

  const raw = String(
    options.explicitAccount || options.accountId || options.accountKey || options.account ||
    pkg?.accountId || pkg?.accountKey || pkg?.account || pkg?.project || pkg?.experiment?.accountId || "shuzhai"
  ).trim();

  let target = null;
  if (["xhs_account_1", "shuzhai", "good try", "good_try"].includes(raw)) {
    target = accountsConfig.shuzhai;
  } else if (["xhs_account_2", "x_curation", "gold chance", "gold_chance", "Gold chance"].includes(raw)) {
    target = accountsConfig.x_curation;
  } else if (["xhs_account_3", "personal_ip", "personal-ip", "枳子8"].includes(raw)) {
    target = accountsConfig.personal_ip;
  } else {
    target = Object.values(accountsConfig).find(a => 
      a.name?.toLowerCase() === raw.toLowerCase() ||
      a.id?.toLowerCase() === raw.toLowerCase() ||
      a.profileDir?.toLowerCase() === raw.toLowerCase()
    );
    if (!target) {
      throw new PipelineRoutingError(`Unknown or unconfigured account: ${raw}`, { accountKey: raw, accountId: raw });
    }
  }

  return {
    ...target,
    id: target.id,
    account_id: target.id,
    accountId: target.id,
    accountKey: target.profileDir,
    account_key: target.profileDir,
    profileDir: target.profileDir,
    profile_dir: target.profileDir
  };
}

function stageImages(pkgId, imagePaths, stagingRoot, targetAccount = null) {
  const dir = path.join(stagingRoot, String(pkgId).replace(/[^a-zA-Z0-9_-]/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const stagedPaths = imagePaths.map((src, i) => {
    const ext = (path.extname(src) || ".png").toLowerCase();
    const dest = path.join(dir, `img-${String(i + 1).padStart(2, "0")}${ext}`);
    fs.copyFileSync(src, dest);
    return dest;
  });
  if (targetAccount) {
    const manifest = {
      packageId: pkgId,
      account_id: targetAccount.id || targetAccount.account_id,
      accountId: targetAccount.id || targetAccount.account_id,
      profile_dir: targetAccount.profileDir || targetAccount.profile_dir,
      profileDir: targetAccount.profileDir || targetAccount.profile_dir,
      stagedAt: new Date().toISOString(),
      images: stagedPaths
    };
    fs.writeFileSync(path.join(dir, "staging.json"), JSON.stringify(manifest, null, 2), "utf8");
  }
  return stagedPaths;
}

export async function publishApprovedPackage(id, options = {}) {
  const pkg = getPackage(id, options);
  if (!pkg) return { ok: false, error: "package_not_found", message: "发布包不存在" };
  if (!["approved", "published", "ready_manual"].includes(pkg.status) || pkg.approvalStatus !== "approved") {
    return { ok: false, error: "not_approved", message: `未批准，不能发布（当前 ${pkg.status}）` };
  }
  if (pkg.platform !== "xiaohongshu") {
    return { ok: false, error: "unsupported_platform", message: `仅支持小红书，当前是 ${pkg.platform}` };
  }
  if (pkg.status === "published" && !options.force) {
    return { ok: false, error: "already_published", message: "已经发过。要重发再点一次。" };
  }

  // Pre-check pipeline isolation BEFORE staging images or launching browser
  let targetAccount;
  try {
    const { validateAccountPipelineIsolation } = await import("../content/store.js");
    targetAccount = resolvePublisherAccount(pkg, options);
    validateAccountPipelineIsolation(pkg, targetAccount);
  } catch (isolationErr) {
    const result = {
      ok: false,
      error: "pipeline_routing_error",
      message: isolationErr.message,
      details: isolationErr.details || {}
    };
    recordPublish(id, result, options);
    return result;
  }

  const note = buildXhsNote(pkg, options.rootDir || root);
  if (!note.title || !note.content) {
    const result = { ok: false, error: "incomplete_note", message: "标题或正文为空，不能发。" };
    recordPublish(id, result, options);
    return result;
  }
  if (!note.images.length) {
    const result = { ok: false, error: "missing_images", message: "发布包没有可用图片。" };
    recordPublish(id, result, options);
    return result;
  }

  const login = options.loginStatus || await getXhsLoginStatus(options);
  if (!login.loggedIn) {
    const result = {
      ok: false,
      error: "xiaohongshu_not_logged_in",
      message: "小红书未上号。扫码登录后再点立即发布。"
    };
    recordPublish(id, result, options);
    return result;
  }

  const images = stageImages(pkg.id, note.images, options.stagingDir || path.join(root, "data", "content", "staging"), targetAccount);
  const request = options.request || ((method, url, body, timeoutMs) => httpJson(method, url, body, timeoutMs));
  const mcp = options.baseUrl
    ? { ok: true, baseUrl: options.baseUrl }
    : (options.request ? { ok: true, baseUrl: "http://127.0.0.1:18060" } : await ensureXhsMcp(options));
  if (!mcp.ok) {
    const result = { ok: false, error: mcp.error, message: mcp.message };
    recordPublish(id, result, options);
    return result;
  }

  try {
    const res = await request("POST", `${mcp.baseUrl}/api/v1/publish`, {
      title: note.title,
      content: note.content,
      images,
      tags: note.tags
    }, options.publishTimeoutMs || 180000);
    const success = res.status >= 200 && res.status < 300 && res.json?.success !== false;
    const result = success
      ? { ok: true, title: note.title, message: res.json?.message || "发布成功", data: res.json?.data || null }
      : { ok: false, error: "publish_failed", message: res.json?.details || res.json?.error || res.json?.message || res.raw || `HTTP ${res.status}` };
    recordPublish(id, result, options);

    if (success) {
      try {
        const { upsertNote } = await import("../../engine/intelligence/xhs/storage/repository.js");
        upsertNote({
          accountKey: targetAccount.profileDir,
          accountId: targetAccount.id,
          profileDir: targetAccount.profileDir,
          noteId: pkg.id,
          title: note.title,
          publishTime: new Date().toISOString(),
          noteType: "normal",
          url: result.data?.note_id ? `https://www.xiaohongshu.com/explore/${result.data.note_id}` : (result.data?.url || null)
        });
      } catch {
        // SQLite record error should not fail publish result
      }
    }

    return result;
  } catch (error) {
    const result = { ok: false, error: "publish_failed", message: error.message };
    recordPublish(id, result, options);
    return result;
  }
}
