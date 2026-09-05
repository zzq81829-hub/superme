import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_FILES_DIR = path.resolve(process.cwd(), "data", "files");

const MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript"
};

const SENSITIVE_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /\.env/i,
  /\.git/i,
  /id_rsa/i,
  /id_ed25519/i,
  /phone-access-token/i,
  /billing-policy/i,
  /tax/i,
  /finance/i,
  /invoice/i,
  /bill/i,
  /salary/i,
  /bank/i,
  /card/i,
  /auth\.json/i,
  /\.ssh/i,
  /\.npmrc/i
];

export function getFileRegistryDir(options = {}) {
  const dir = options.baseDir || process.env.FILES_BASE_DIR || DEFAULT_FILES_DIR;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function registryFilePath(options = {}) {
  return path.join(getFileRegistryDir(options), "registry.json");
}

export function loadRegistry(options = {}) {
  const file = registryFilePath(options);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function saveRegistry(registry, options = {}) {
  const file = registryFilePath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(registry, null, 2), "utf8");
}

export function isSensitivePath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  return SENSITIVE_PATTERNS.some((p) => p.test(normalized));
}

export function validateSafePath(filePath, projectRoot = process.cwd()) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path");
  }

  const root = path.resolve(projectRoot);
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);

  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path traversal outside project root is forbidden");
  }

  if (isSensitivePath(relativePath) || isSensitivePath(filePath)) {
    throw new Error("Access to sensitive or private file is forbidden");
  }

  // Resolve the actual filesystem target when it exists. Lexical path checks
  // alone allow a symlink inside the project to point outside it.
  if (fs.existsSync(absolutePath)) {
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(absolutePath);
    const realRelative = path.relative(realRoot, realTarget);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error("Resolved file path is outside project root");
    }
    if (path.normalize(realTarget).toLowerCase() !== path.normalize(absolutePath).toLowerCase()) {
      throw new Error("Symbolic-link file paths are forbidden");
    }
  }

  return { absolutePath, relativePath: relativePath.replace(/\\/g, "/") };
}

export function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export function computeFileHash(absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function registerFile(params = {}, options = {}) {
  const {
    taskId = null,
    filePath,
    projectRoot = process.cwd(),
    verified = false,
    sendable = false,
    deliveryStatus = "held",
    mime = null
  } = params;

  const isVerified = Boolean(params.verified !== undefined ? params.verified : params.accepted);
  const isSendable = Boolean(params.sendable !== undefined ? params.sendable : params.allowSend);

  if (isSendable && !isVerified) {
    throw new Error("未验收文件不能标记为可发送 (Unverified files cannot be marked as sendable)");
  }

  const { absolutePath, relativePath } = validateSafePath(filePath, projectRoot);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist on disk: ${relativePath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    throw new Error("Cannot register a directory as a file");
  }

  const hash = computeFileHash(absolutePath);
  const fileId = `fil_${crypto.createHash("md5").update(`${relativePath}:${hash}`).digest("hex").slice(0, 12)}`;
  const name = path.basename(absolutePath);
  const detectedMime = mime || detectMimeType(absolutePath);

  const registry = loadRegistry(options);
  const existing = registry[fileId];

  const record = {
    fileId,
    taskId,
    packageId: params.packageId || existing?.packageId || null,
    fileName: name,
    name,
    path: relativePath,
    relativePath,
    absolutePath,
    mime: detectedMime,
    mimeType: detectedMime,
    size: stat.size,
    sizeBytes: stat.size,
    hash,
    sha256: hash,
    createdAt: existing?.createdAt || new Date().toISOString(),
    sourceWorker: params.sourceWorker || existing?.sourceWorker || null,
    verified: isVerified,
    accepted: isVerified,
    sendable: isSendable,
    allowSend: isSendable,
    deliveryStatus: String(deliveryStatus || existing?.deliveryStatus || "held")
  };

  registry[fileId] = record;
  saveRegistry(registry, options);

  return record;
}

export function updateFile(fileId, updates = {}, options = {}) {
  const registry = loadRegistry(options);
  const existing = registry[fileId];
  if (!existing) {
    throw new Error(`File not found in registry: ${fileId}`);
  }

  const nextVerified = updates.verified !== undefined
    ? Boolean(updates.verified)
    : (updates.accepted !== undefined ? Boolean(updates.accepted) : existing.verified);

  const nextSendable = updates.sendable !== undefined
    ? Boolean(updates.sendable)
    : (updates.allowSend !== undefined ? Boolean(updates.allowSend) : existing.sendable);

  if (nextSendable && !nextVerified) {
    throw new Error("未验收文件不能标记为可发送 (Unverified files cannot be marked as sendable)");
  }

  const updated = {
    ...existing,
    ...updates,
    fileId: existing.fileId, // immutable
    verified: nextVerified,
    accepted: nextVerified,
    sendable: nextSendable,
    allowSend: nextSendable,
    deliveryStatus: updates.deliveryStatus
      ? String(updates.deliveryStatus)
      : (updates.status ? String(updates.status) : existing.deliveryStatus)
  };

  registry[fileId] = updated;
  saveRegistry(registry, options);
  return updated;
}

export function verifyFileHash(fileId, options = {}) {
  const file = getFile(fileId, options);
  if (!file) throw new Error(`File not found in registry: ${fileId}`);
  if (!fs.existsSync(file.absolutePath)) {
    return { valid: false, reason: "missing_on_disk" };
  }
  const currentHash = computeFileHash(file.absolutePath);
  const currentStat = fs.statSync(file.absolutePath);
  const valid = currentHash === (file.sha256 || file.hash) && currentStat.size === (file.sizeBytes || file.size);
  return {
    valid,
    expectedHash: file.sha256 || file.hash,
    actualHash: currentHash,
    expectedSize: file.sizeBytes || file.size,
    actualSize: currentStat.size
  };
}

export function getFile(fileId, options = {}) {
  const registry = loadRegistry(options);
  return registry[fileId] || null;
}

export function toPublicFile(file) {
  if (!file) return null;
  const {
    absolutePath: _absolutePath,
    ...rest
  } = file;
  return rest;
}

export function listFiles(filter = {}, options = {}) {
  const registry = loadRegistry(options);
  let list = Object.values(registry);

  if (filter.taskId) {
    list = list.filter((f) => f.taskId === filter.taskId);
  }
  if (filter.packageId) {
    list = list.filter((f) => f.packageId === filter.packageId);
  }
  if (filter.verified !== undefined) {
    list = list.filter((f) => f.verified === filter.verified);
  }
  if (filter.sendable !== undefined) {
    list = list.filter((f) => f.sendable === filter.sendable);
  }
  if (filter.deliveryStatus) {
    list = list.filter((f) => f.deliveryStatus === filter.deliveryStatus);
  }

  return list;
}

export function syncFromDeliverables(task, projectRoot = process.cwd(), options = {}) {
  if (!task || !task.deliverables?.artifacts) return [];
  const verified = task.status === "completed";
  const registered = [];

  for (const artifact of task.deliverables.artifacts) {
    try {
      const rec = registerFile(
        {
          taskId: task.id,
          filePath: artifact.path,
          projectRoot,
          verified,
          sendable: false,
          deliveryStatus: "held",
          sourceWorker: task.agentResolved || task.agent || null
        },
        options
      );
      artifact.fileId = rec.fileId;
      artifact.sha256 = rec.sha256;
      registered.push(rec);
    } catch {
      // Ignore sensitive or missing files during auto-sync
    }
  }
  return registered;
}

export function syncFromContentPackage(pkg, projectRoot = process.cwd(), options = {}) {
  if (!pkg || !Array.isArray(pkg.media)) return [];
  const verified = pkg.status === "approved" || pkg.status === "published";
  const registered = [];

  for (const item of pkg.media) {
    if (!item.path) continue;
    try {
      const rec = registerFile(
        {
          taskId: pkg.id,
          packageId: pkg.id,
          filePath: item.path,
          projectRoot,
          verified,
          sendable: verified,
          allowSend: verified,
          deliveryStatus: verified ? "allowed" : "held"
        },
        options
      );
      item.fileId = rec.fileId;
      item.sha256 = rec.sha256;
      registered.push(rec);
    } catch {
      // Ignore sensitive or missing files during auto-sync
    }
  }
  return registered;
}
