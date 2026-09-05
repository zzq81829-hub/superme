import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { listFiles, updateFile } from "../files/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFile = path.resolve(__dirname, "../../data/delivery/outbox.json");

function outboxPath(options = {}) {
  return options.file || process.env.DELIVERY_OUTBOX_FILE || defaultFile;
}

export function loadOutbox(options = {}) {
  const file = outboxPath(options);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveOutbox(items, options = {}) {
  const file = outboxPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(items, null, 2), "utf8");
  return items;
}

export function enqueueDelivery({
  fileId,
  packageId = null,
  channel = "none",
  status = "held",
  accountId = null,
  account_id = null,
  profileDir = null,
  profile_dir = null
} = {}, options = {}) {
  if (!fileId) throw new Error("fileId is required");
  const items = loadOutbox(options);
  const existing = items.find((d) => d.fileId === fileId && d.packageId === packageId);
  if (existing) return existing;

  const initialStatus = status || "held";
  const resolvedAccountId = accountId || account_id || options.accountId || options.account_id || null;
  const resolvedProfileDir = profileDir || profile_dir || options.profileDir || options.profile_dir || null;
  const record = {
    deliveryId: `dlv-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    fileId,
    packageId,
    channel,
    accountId: resolvedAccountId,
    account_id: resolvedAccountId,
    profileDir: resolvedProfileDir,
    profile_dir: resolvedProfileDir,
    status: initialStatus,
    allowSend: initialStatus === "allowed",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    sentAt: null,
    error: null
  };
  items.unshift(record);
  saveOutbox(items, options);
  return record;
}

export function allowPackageDelivery(packageId, options = {}) {
  if (!packageId) return [];
  const allFiles = listFiles({}, options);
  const files = allFiles.filter((f) => f.packageId === packageId || f.taskId === packageId);
  const items = loadOutbox(options);
  const now = new Date().toISOString();
  const updated = [];

  let accountId = options.accountId || options.account_id || null;
  let profileDir = options.profileDir || options.profile_dir || null;
  if (!accountId && packageId) {
    if (String(packageId).startsWith("shuzhai")) {
      accountId = "shuzhai";
      profileDir = "xhs_account_1";
    } else if (String(packageId).startsWith("x_curation") || String(packageId).startsWith("gold")) {
      accountId = "x_curation";
      profileDir = "xhs_account_2";
    }
  }

  for (const file of files) {
    try {
      updateFile(file.fileId, { verified: true, sendable: true, allowSend: true, deliveryStatus: "allowed" }, options);
    } catch {
      continue;
    }
    let rec = items.find((d) => d.fileId === file.fileId && d.packageId === packageId);
    if (!rec) {
      rec = {
        deliveryId: `dlv-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
        fileId: file.fileId,
        packageId,
        channel: "xiaohongshu",
        accountId,
        account_id: accountId,
        profileDir,
        profile_dir: profileDir,
        status: "allowed",
        allowSend: true,
        createdAt: now,
        decidedAt: now,
        sentAt: null,
        error: null
      };
      items.unshift(rec);
    } else {
      rec.status = "allowed";
      rec.allowSend = true;
      rec.channel = rec.channel && rec.channel !== "none" ? rec.channel : "xiaohongshu";
      rec.decidedAt = now;
      if (accountId) { rec.accountId = accountId; rec.account_id = accountId; }
      if (profileDir) { rec.profileDir = profileDir; rec.profile_dir = profileDir; }
    }
    updated.push(rec);
  }

  for (const rec of items) {
    if (rec.packageId === packageId && rec.status === "held" && !updated.includes(rec)) {
      rec.status = "allowed";
      rec.allowSend = true;
      rec.decidedAt = now;
      if (accountId) { rec.accountId = accountId; rec.account_id = accountId; }
      if (profileDir) { rec.profileDir = profileDir; rec.profile_dir = profileDir; }
      updated.push(rec);
    }
  }

  saveOutbox(items, options);
  return updated;
}

export function revokePackageDelivery(packageId, options = {}) {
  if (!packageId) return [];
  const targetStatus = options.targetStatus || options.status || "held";
  const allFiles = listFiles({}, options);
  const files = allFiles.filter((f) => f.packageId === packageId || f.taskId === packageId);
  const items = loadOutbox(options);
  const now = new Date().toISOString();
  const updated = [];

  for (const file of files) {
    try {
      updateFile(
        file.fileId,
        {
          sendable: false,
          allowSend: false,
          deliveryStatus: targetStatus
        },
        options
      );
    } catch {
      continue;
    }
  }

  for (const rec of items) {
    if (rec.packageId === packageId) {
      if (rec.status === "allowed" || rec.status === "held") {
        rec.status = targetStatus;
        rec.allowSend = false;
        rec.decidedAt = now;
        updated.push(rec);
      }
    }
  }

  saveOutbox(items, options);
  return updated;
}

export function markDeliverySent(packageId, options = {}) {
  const items = loadOutbox(options);
  const now = new Date().toISOString();
  for (const rec of items) {
    if (rec.packageId === packageId && rec.status === "allowed") {
      rec.status = "sent";
      rec.sentAt = now;
    }
  }
  saveOutbox(items, options);
  return items.filter((d) => d.packageId === packageId);
}

export function getOutboxItem(deliveryId, options = {}) {
  const items = loadOutbox(options);
  return items.find((d) => d.deliveryId === deliveryId) || null;
}

export function listOutbox(filter = {}, options = {}) {
  let items = loadOutbox(options);
  if (filter.status) items = items.filter((d) => d.status === filter.status);
  if (filter.packageId) items = items.filter((d) => d.packageId === filter.packageId);
  if (filter.fileId) items = items.filter((d) => d.fileId === filter.fileId);
  if (filter.allowSend !== undefined) items = items.filter((d) => d.allowSend === filter.allowSend);
  return items;
}
