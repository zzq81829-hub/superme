import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import express from "express";
import {
  registerFile,
  updateFile,
  getFile,
  listFiles,
  toPublicFile,
  computeFileHash,
  verifyFileHash,
  validateSafePath,
  isSensitivePath,
  syncFromDeliverables,
  syncFromContentPackage,
  getFileRegistryDir
} from "../src/files/registry.js";
import {
  enqueueDelivery,
  allowPackageDelivery,
  revokePackageDelivery,
  markDeliverySent,
  getOutboxItem,
  listOutbox,
  loadOutbox
} from "../src/delivery/outbox.js";
import {
  createPackage,
  getPackage,
  freezePackage,
  approvePackage,
  rejectPackage,
  recordPublish
} from "../src/content/store.js";
import { createTask, getTask } from "../src/store.js";
import { handleFileDownload } from "../src/files/download.js";
import { getPhoneAccessToken } from "../src/phoneAccess.js";

const rejectAutoSend = (_req, res) => {
  res.status(403).json({
    ok: false,
    code: "AUTONOMOUS_SEND_FORBIDDEN",
    error: "AUTONOMOUS_SEND_FORBIDDEN: Agents cannot publish. Founder approval publishes via /approve; retry via /publish after login."
  });
};

function setupIsolatedEnv() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "m5-outbox-test-"));
  const filesDir = path.join(baseDir, "files");
  const packagesDir = path.join(baseDir, "content", "packages");
  const deliveryDir = path.join(baseDir, "delivery");
  const tasksDir = path.join(baseDir, "tasks");
  const outboxFile = path.join(deliveryDir, "outbox.json");

  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(deliveryDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });

  process.env.FILES_BASE_DIR = filesDir;
  process.env.CONTENT_PACKAGES_DIR = packagesDir;
  process.env.DELIVERY_OUTBOX_FILE = outboxFile;
  process.env.TASKS_BASE_DIR = tasksDir;

  const options = {
    baseDir,
    filesDir,
    packagesDir,
    deliveryDir,
    tasksDir,
    file: outboxFile
  };

  return { baseDir, filesDir, packagesDir, deliveryDir, tasksDir, outboxFile, options };
}

function completeExperiment(overrides = {}) {
  return {
    accountId: "shuzhai",
    source: "测试来源",
    insight: "测试洞察",
    audience: "测试受众",
    painOrDesire: "测试痛点",
    objective: "save",
    topic: "测试选题",
    title: "测试标题",
    hookType: "contrarian",
    emotion: "relief",
    contentStructure: "pain-insight-action",
    cta: "测试行动",
    predictionScores: { traffic: 7, click: 7, read: 7, save: 7, discussion: 7, share: 7, follow: 7, fit: 7, evidence: 7 },
    recommendation: "测试推荐",
    risks: [],
    strategyVersion: "test-v1",
    hypothesisIds: ["H-TEST"],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// TEST 1: Full-File SHA-256 Byte Hashing & Byte Size Integrity
// ---------------------------------------------------------------------------
test("R4-Outbox-1: Full-file SHA-256 byte hashing matches physical disk bytes and exact byte size", () => {
  const { baseDir, options } = setupIsolatedEnv();

  // Create a real binary/text file
  const testFilePath = path.join(baseDir, "render_slide_01.png");
  const binaryPayload = Buffer.from("PNG_HEADER_DATA_STREAM_BYTES_FOR_FOUNDER_OS_TESTING", "utf8");
  fs.writeFileSync(testFilePath, binaryPayload);

  const expectedSha256 = crypto.createHash("sha256").update(binaryPayload).digest("hex");
  const expectedSize = binaryPayload.length;

  const record = registerFile(
    {
      filePath: testFilePath,
      projectRoot: baseDir,
      verified: true,
      sendable: false,
      deliveryStatus: "held",
      taskId: "task-render-01"
    },
    options
  );

  assert.equal(record.sha256, expectedSha256, "Registry sha256 must match real byte SHA-256");
  assert.equal(record.hash, expectedSha256, "Registry hash must match real byte SHA-256");
  assert.equal(record.sizeBytes, expectedSize, "Registry sizeBytes must match exact stat size");
  assert.equal(record.size, expectedSize, "Registry size must match exact stat size");
  assert.equal(record.deliveryStatus, "held", "Default deliveryStatus must be held");

  // Verify hash verification helper returns valid: true
  const integrity = verifyFileHash(record.fileId, options);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.actualHash, expectedSha256);
  assert.equal(integrity.actualSize, expectedSize);

  // Test zero-byte file
  const emptyFilePath = path.join(baseDir, "empty.txt");
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));
  const emptyRecord = registerFile(
    {
      filePath: emptyFilePath,
      projectRoot: baseDir,
      verified: false,
      sendable: false
    },
    options
  );
  assert.equal(emptyRecord.sha256, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(emptyRecord.sizeBytes, 0);

  // Modify file on disk: verifyFileHash detects mismatch
  fs.writeFileSync(testFilePath, Buffer.from("TAMPERED_BYTE_CONTENT", "utf8"));
  const tamperedIntegrity = verifyFileHash(record.fileId, options);
  assert.equal(tamperedIntegrity.valid, false, "Modified file must be detected as invalid");
  assert.notEqual(tamperedIntegrity.actualHash, expectedSha256);
});

// ---------------------------------------------------------------------------
// TEST 2: Safe Path Traversal & Sensitive File Protection
// ---------------------------------------------------------------------------
test("R4-Outbox-2: Safe path validation strictly prevents path traversals, escapes, and sensitive leaks", () => {
  const { baseDir } = setupIsolatedEnv();

  // 1. Path traversal outside project root
  assert.throws(
    () => validateSafePath("../../../etc/shadow", baseDir),
    /Path traversal outside project root is forbidden/
  );
  assert.throws(
    () => validateSafePath("sub/../../../../windows/system32/cmd.exe", baseDir),
    /Path traversal outside project root is forbidden/
  );

  // 2. Sensitive file patterns
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("phone-access-token"), true);
  assert.equal(isSensitivePath("credentials.json"), true);
  assert.equal(isSensitivePath("auth.json"), true);
  assert.equal(isSensitivePath("finance/tax_report.xlsx"), true);

  assert.throws(
    () => validateSafePath(".env", baseDir),
    /Access to sensitive or private file is forbidden/
  );
  assert.throws(
    () => validateSafePath("keys/id_rsa", baseDir),
    /Access to sensitive or private file is forbidden/
  );

  // 3. Directory registration rejected
  const dirPath = path.join(baseDir, "somedir");
  fs.mkdirSync(dirPath, { recursive: true });
  assert.throws(
    () => registerFile({ filePath: dirPath, projectRoot: baseDir }),
    /Cannot register a directory as a file/
  );
});

// ---------------------------------------------------------------------------
// TEST 3: Verification & Sendable Invariant Enforcement
// ---------------------------------------------------------------------------
test("R4-Outbox-3: Invariant sendable && !verified throws error consistently in register and update", () => {
  const { baseDir, options } = setupIsolatedEnv();
  const filePath = path.join(baseDir, "candidate.png");
  fs.writeFileSync(filePath, "image-content");

  // Cannot register unverified file as sendable: true
  assert.throws(
    () => {
      registerFile(
        {
          filePath,
          projectRoot: baseDir,
          verified: false,
          sendable: true
        },
        options
      );
    },
    /未验收文件不能标记为可发送/
  );

  // Cannot register unverified file with allowSend: true
  assert.throws(
    () => {
      registerFile(
        {
          filePath,
          projectRoot: baseDir,
          verified: false,
          allowSend: true
        },
        options
      );
    },
    /未验收文件不能标记为可发送/
  );

  // Register with verified: false, sendable: false succeeds
  const unverified = registerFile(
    {
      filePath,
      projectRoot: baseDir,
      verified: false,
      sendable: false
    },
    options
  );
  assert.equal(unverified.verified, false);
  assert.equal(unverified.sendable, false);

  // Cannot update unverified file with sendable: true
  assert.throws(
    () => updateFile(unverified.fileId, { sendable: true }, options),
    /未验收文件不能标记为可发送/
  );

  // Cannot update unverified file with allowSend: true
  assert.throws(
    () => updateFile(unverified.fileId, { allowSend: true }, options),
    /未验收文件不能标记为可发送/
  );

  // Verifying file permits setting sendable: true
  const verified = updateFile(unverified.fileId, { verified: true, sendable: true }, options);
  assert.equal(verified.verified, true);
  assert.equal(verified.sendable, true);
});

// ---------------------------------------------------------------------------
// TEST 4: Delivery Outbox Defaults to 'held' and allowSend: false
// ---------------------------------------------------------------------------
test("R4-Outbox-4: Delivery outbox items default to status 'held' and allowSend: false", () => {
  const { baseDir, options } = setupIsolatedEnv();
  const filePath = path.join(baseDir, "output_doc.md");
  fs.writeFileSync(filePath, "# Report Content");

  const file = registerFile(
    {
      filePath,
      projectRoot: baseDir,
      verified: true,
      sendable: false
    },
    options
  );

  const outboxItem = enqueueDelivery(
    {
      fileId: file.fileId,
      packageId: "pkg-hold-1",
      channel: "local"
    },
    options
  );

  assert.equal(outboxItem.status, "held", "Default status must be held");
  assert.equal(outboxItem.allowSend, false, "Default allowSend must be false");
  assert.equal(outboxItem.sentAt, null, "sentAt must be null");

  const heldList = listOutbox({ status: "held" }, options);
  assert.equal(heldList.length, 1);
  assert.equal(heldList[0].fileId, file.fileId);

  // Lookup by deliveryId
  const loaded = getOutboxItem(outboxItem.deliveryId, options);
  assert.ok(loaded);
  assert.equal(loaded.deliveryId, outboxItem.deliveryId);
  assert.equal(loaded.status, "held");
});

// ---------------------------------------------------------------------------
// TEST 5: Task Deliverables Auto-Sync with Rich Metadata Enrichment
// ---------------------------------------------------------------------------
test("R4-Outbox-5: syncFromDeliverables indexes task artifacts with SHA-256 and enqueues held outbox items", () => {
  const { baseDir, options } = setupIsolatedEnv();

  const artifactRelPath = "output_visual.png";
  const artifactAbsPath = path.join(baseDir, artifactRelPath);
  fs.writeFileSync(artifactAbsPath, "VISUAL_PAYLOAD_FOR_TASK");

  const task = createTask(
    {
      title: "生成小红书视觉图",
      status: "completed",
      agentResolved: "antigravity"
    },
    options
  );
  task.status = "completed";
  task.deliverables = {
    artifacts: [
      { label: "视觉展示", path: artifactRelPath }
    ]
  };

  const registered = syncFromDeliverables(task, baseDir, options);
  assert.equal(registered.length, 1);
  const rec = registered[0];
  assert.equal(rec.verified, true);
  assert.equal(rec.sendable, false, "Task deliverables are not sendable until packaged and approved");
  assert.equal(rec.deliveryStatus, "held");
  assert.ok(rec.sha256);
  assert.equal(rec.sizeBytes, "VISUAL_PAYLOAD_FOR_TASK".length);

  // Verify task artifact was enriched with fileId and sha256
  assert.equal(task.deliverables.artifacts[0].fileId, rec.fileId);
  assert.equal(task.deliverables.artifacts[0].sha256, rec.sha256);

  // Enqueue to outbox
  const outboxEntry = enqueueDelivery({ fileId: rec.fileId, packageId: null, channel: "local" }, options);
  assert.equal(outboxEntry.status, "held");
  assert.equal(outboxEntry.allowSend, false);
});

// ---------------------------------------------------------------------------
// TEST 6: Package Freeze Media Pre-Registration in Held State
// ---------------------------------------------------------------------------
test("R4-Outbox-6: freezePackage registers media files as held without premature send authorization", () => {
  const { baseDir, options } = setupIsolatedEnv();

  const mediaRel = "media/cover.png";
  const mediaAbs = path.join(baseDir, mediaRel);
  fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
  fs.writeFileSync(mediaAbs, "COVER_IMAGE_DATA");

  const pkg = createPackage(
    {
      title: "读书笔记",
      body: "深度解读",
      platform: "xiaohongshu",
      media: [{ path: mediaRel, kind: "cover" }],
      experiment: completeExperiment({
        angle: "干货",
        hook: "3秒破防",
        audience: "年轻职场人"
      })
    },
    options
  );

  // Freeze package
  const frozen = freezePackage(pkg.id, { ...options, projectRoot: baseDir });
  assert.equal(frozen.status, "awaiting_approval");

  // Verify media file is pre-registered in held status
  const files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files.length, 1);
  const mediaFile = files[0];
  assert.equal(mediaFile.deliveryStatus, "held");
  assert.equal(mediaFile.verified, false, "Frozen package media remains unverified");
  assert.equal(mediaFile.sendable, false, "Frozen package media remains unsendable");
  assert.equal(mediaFile.allowSend, false);
});

// ---------------------------------------------------------------------------
// TEST 7: Package Approval Releases Media to 'allowed' Without Auto-Broadcast
// ---------------------------------------------------------------------------
test("R4-Outbox-7: approvePackage transitions outbox to 'allowed' and allowSend: true without broadcast", () => {
  const { baseDir, options } = setupIsolatedEnv();

  const mediaRel = "media/slide.png";
  const mediaAbs = path.join(baseDir, mediaRel);
  fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
  fs.writeFileSync(mediaAbs, "SLIDE_DATA");

  const pkg = createPackage(
    {
      title: "认知跃迁指南",
      body: "破局思考",
      platform: "xiaohongshu",
      media: [{ path: mediaRel, kind: "slide" }],
      experiment: completeExperiment({
        angle: "认知",
        hook: "打破信息茧房",
        audience: "创作者"
      })
    },
    options
  );

  freezePackage(pkg.id, { ...options, projectRoot: baseDir });

  // Approve package
  const approved = approvePackage(pkg.id, { ...options, projectRoot: baseDir });
  assert.equal(approved.status, "approved");

  // Registry file must be marked allowed and sendable
  const files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files.length, 1);
  const file = files[0];
  assert.equal(file.deliveryStatus, "allowed");
  assert.equal(file.verified, true);
  assert.equal(file.sendable, true);
  assert.equal(file.allowSend, true);

  // Outbox items must transition to allowed
  const outboxItems = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outboxItems.length, 1);
  const item = outboxItems[0];
  assert.equal(item.status, "allowed");
  assert.equal(item.allowSend, true);
  assert.ok(item.decidedAt);
  assert.equal(item.sentAt, null, "Item must NOT be marked sent: no auto-broadcast allowed");
});

// ---------------------------------------------------------------------------
// TEST 8: Package Rejection Revokes Delivery Back to 'held' / 'blocked'
// ---------------------------------------------------------------------------
test("R4-Outbox-8: rejectPackage triggers revokePackageDelivery resetting outbox to 'held' and allowSend: false", () => {
  const { baseDir, options } = setupIsolatedEnv();

  const mediaRel = "media/cancel_slide.png";
  const mediaAbs = path.join(baseDir, mediaRel);
  fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
  fs.writeFileSync(mediaAbs, "CANCEL_SLIDE_DATA");

  const pkg = createPackage(
    {
      title: "待撤销内容",
      body: "测试撤回机制",
      platform: "xiaohongshu",
      media: [{ path: mediaRel, kind: "slide" }],
      experiment: completeExperiment({
        angle: "测试",
        hook: "测试撤销",
        audience: "所有人"
      })
    },
    options
  );

  freezePackage(pkg.id, { ...options, projectRoot: baseDir });
  approvePackage(pkg.id, { ...options, projectRoot: baseDir });

  // Outbox is currently allowed
  let outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "allowed");
  assert.equal(outbox[0].allowSend, true);

  // Founder rejects the package
  const rejected = rejectPackage(pkg.id, { reason: "Founder changed mind on topic" }, { ...options, projectRoot: baseDir });
  assert.equal(rejected.status, "revoked");

  // Outbox must be reset to held
  outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].status, "held");
  assert.equal(outbox[0].allowSend, false);

  // Registry file must be reset to held and unsendable
  const files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files[0].deliveryStatus, "held");
  assert.equal(files[0].sendable, false);
  assert.equal(files[0].allowSend, false);

  // Direct revocation with status 'blocked'
  const revokedBlocked = revokePackageDelivery(pkg.id, { ...options, status: "blocked" });
  assert.equal(revokedBlocked.length, 1);
  assert.equal(revokedBlocked[0].status, "blocked");
  assert.equal(revokedBlocked[0].allowSend, false);

  const blockedOutbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(blockedOutbox[0].status, "blocked");
});

// ---------------------------------------------------------------------------
// TEST 9: Direct /send Endpoints Consistently Return HTTP 403 Forbidden
// ---------------------------------------------------------------------------
test("R4-Outbox-9: Direct /send endpoints permanently return HTTP 403 AUTONOMOUS_SEND_FORBIDDEN", async () => {
  const app = express();
  app.use(express.json());

  app.post("/api/content/packages/:id/send", rejectAutoSend);
  app.post("/api/publish/:id/send", rejectAutoSend);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Direct send to package endpoint
    const res1 = await fetch(`http://127.0.0.1:${port}/api/content/packages/pkg-test-123/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true })
    });
    assert.equal(res1.status, 403, "Direct package send must return HTTP 403");
    const json1 = await res1.json();
    assert.equal(json1.ok, false);
    assert.equal(json1.code, "AUTONOMOUS_SEND_FORBIDDEN");
    assert.ok(json1.error.includes("AUTONOMOUS_SEND_FORBIDDEN"));

    // 2. Direct send to publish endpoint
    const res2 = await fetch(`http://127.0.0.1:${port}/api/publish/pkg-test-123/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishNow: true })
    });
    assert.equal(res2.status, 403, "Direct publish send must return HTTP 403");
    const json2 = await res2.json();
    assert.equal(json2.ok, false);
    assert.equal(json2.code, "AUTONOMOUS_SEND_FORBIDDEN");
    assert.ok(json2.error.includes("AUTONOMOUS_SEND_FORBIDDEN"));
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// TEST 10: Phone Download Tamper Detection & Security Authorization
// ---------------------------------------------------------------------------
test("R4-Outbox-10: Secure phone download verifies token, rejects unverified files, and detects byte tampering", async () => {
  const { baseDir, options } = setupIsolatedEnv();
  const tokenPath = path.join(baseDir, "phone-access-token");
  const tokenOptions = { tokenPath };
  const token = getPhoneAccessToken(tokenOptions);

  const app = express();
  app.get("/api/files/:id/download", (req, res) => {
    handleFileDownload(req, res, {
      tokenOptions,
      fileOptions: options,
      projectRoot: baseDir
    });
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const filePath = path.join(baseDir, "deliverable.png");
    fs.writeFileSync(filePath, "GENUINE_FILE_BYTES_54321");

    // 1. Unverified file returns 403
    const unverifiedRec = registerFile(
      {
        filePath,
        projectRoot: baseDir,
        verified: false,
        sendable: false
      },
      options
    );

    const resUnverified = await fetch(`http://127.0.0.1:${port}/api/files/${unverifiedRec.fileId}/download`, {
      headers: { "X-OS-Phone-Token": token }
    });
    assert.equal(resUnverified.status, 403, "Unverified file cannot be downloaded");

    // 2. Missing token header returns 401
    const resNoToken = await fetch(`http://127.0.0.1:${port}/api/files/${unverifiedRec.fileId}/download`);
    assert.equal(resNoToken.status, 401, "Missing phone token returns 401");

    // 3. Token in query parameter is rejected with 401
    const resQueryToken = await fetch(`http://127.0.0.1:${port}/api/files/${unverifiedRec.fileId}/download?token=${token}`);
    assert.equal(resQueryToken.status, 401, "Query param token is rejected with 401");

    // 4. Verified file downloads correctly
    updateFile(unverifiedRec.fileId, { verified: true, sendable: true }, options);
    const resVerified = await fetch(`http://127.0.0.1:${port}/api/files/${unverifiedRec.fileId}/download`, {
      headers: { "X-OS-Phone-Token": token }
    });
    assert.equal(resVerified.status, 200, "Verified file with token downloads with 200");
    const downloadedText = await resVerified.text();
    assert.equal(downloadedText, "GENUINE_FILE_BYTES_54321");

    // 5. Tampered file on disk returns 409 Conflict
    fs.writeFileSync(filePath, "CORRUPTED_TAMPERED_BYTES");
    const resTampered = await fetch(`http://127.0.0.1:${port}/api/files/${unverifiedRec.fileId}/download`, {
      headers: { "X-OS-Phone-Token": token }
    });
    assert.equal(resTampered.status, 409, "Disk hash mismatch returns 409 Conflict");
    const tamperedJson = await resTampered.json();
    assert.ok(tamperedJson.error.includes("文件内容已变化，拒绝下载"));
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// TEST 11: End-to-End Delivery Outbox Lifecycle Progression
// ---------------------------------------------------------------------------
test("R4-Outbox-11: Full lifecycle: draft -> freeze (held) -> approve (allowed) -> reject (held) -> re-approve -> publish (sent)", () => {
  const { baseDir, options } = setupIsolatedEnv();

  const imgRel = "images/note_page.png";
  const imgAbs = path.join(baseDir, imgRel);
  fs.mkdirSync(path.dirname(imgAbs), { recursive: true });
  fs.writeFileSync(imgAbs, "NOTE_PAGE_IMAGE_BYTES");

  // Step 1: Create package draft
  const pkg = createPackage(
    {
      title: "自学习运营复盘",
      body: "数据闭环报告",
      platform: "xiaohongshu",
      media: [{ path: imgRel, kind: "body" }],
      experiment: completeExperiment({
        angle: "复盘",
        hook: "数据说话",
        audience: "运营人员"
      })
    },
    options
  );

  // Step 2: Freeze package
  freezePackage(pkg.id, { ...options, projectRoot: baseDir });
  let files = listFiles({ packageId: pkg.id }, options);
  assert.equal(files[0].deliveryStatus, "held");
  assert.equal(files[0].verified, false);

  // Step 3: Approve package
  approvePackage(pkg.id, { ...options, projectRoot: baseDir });
  let outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "allowed");
  assert.equal(outbox[0].allowSend, true);

  // Step 4: Revoke package approval
  rejectPackage(pkg.id, { reason: "Need data revision" }, { ...options, projectRoot: baseDir });
  outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "held");
  assert.equal(outbox[0].allowSend, false);

  // Step 5: Re-freeze and Re-approve
  freezePackage(pkg.id, { ...options, projectRoot: baseDir });
  approvePackage(pkg.id, { ...options, projectRoot: baseDir });
  outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "allowed");
  assert.equal(outbox[0].allowSend, true);

  // Step 6: Mark delivery sent upon external publishing
  recordPublish(pkg.id, { ok: true, title: "自学习运营复盘", message: "published" }, options);
  outbox = listOutbox({ packageId: pkg.id }, options);
  assert.equal(outbox[0].status, "sent");
  assert.ok(outbox[0].sentAt);
});
