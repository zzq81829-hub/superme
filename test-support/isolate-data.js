import fs from "fs";
import os from "os";
import path from "path";

// Every test process gets its own disposable data root. This prevents tests that
// exercise approvals, tasks, memory, or the secretary inbox from touching the
// founder's live dashboard data.
export const testDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-tests-"));

export const workforceDir = path.join(testDataRoot, "workforce");
export const learningEventsDir = path.join(testDataRoot, "learning", "events");
export const filesDir = path.join(testDataRoot, "files");
export const deliveryDir = path.join(testDataRoot, "delivery");
export const deliveryOutboxFile = path.join(deliveryDir, "outbox.json");
export const billingDir = path.join(testDataRoot, "billing");

fs.mkdirSync(path.join(testDataRoot, "task-store"), { recursive: true });
fs.mkdirSync(path.join(testDataRoot, "memory"), { recursive: true });
fs.mkdirSync(path.join(testDataRoot, "secretary"), { recursive: true });
fs.mkdirSync(path.join(testDataRoot, "quota"), { recursive: true });
fs.mkdirSync(path.join(testDataRoot, "reviews"), { recursive: true });
fs.mkdirSync(workforceDir, { recursive: true });
fs.mkdirSync(learningEventsDir, { recursive: true });
fs.mkdirSync(filesDir, { recursive: true });
fs.mkdirSync(deliveryDir, { recursive: true });
fs.mkdirSync(billingDir, { recursive: true });

process.env.TASKS_BASE_DIR = path.join(testDataRoot, "task-store");
process.env.MEMORY_BASE_DIR = path.join(testDataRoot, "memory");
process.env.SECRETARY_BASE_DIR = path.join(testDataRoot, "secretary");
process.env.QUOTA_BASE_DIR = path.join(testDataRoot, "quota");
process.env.REVIEWS_BASE_DIR = path.join(testDataRoot, "reviews");
process.env.BRIEF_FILE = path.join(testDataRoot, "BRIEF.md");
process.env.READ_SCOPE_FILE = path.join(testDataRoot, "READ_SCOPE.md");
process.env.PONYTAIL_SKILL_FILE = path.join(testDataRoot, "no-ponytail-skill");

process.env.WORKFORCE_BASE_DIR = workforceDir;
process.env.ACCOUNT_POOLS_FILE = path.join(workforceDir, "account_pools.json");
process.env.LEARNING_EVENTS_DIR = learningEventsDir;
process.env.FILES_BASE_DIR = filesDir;
process.env.DELIVERY_OUTBOX_FILE = deliveryOutboxFile;
process.env.BILLING_BASE_DIR = billingDir;

export function cleanTemp() {
  try {
    fs.rmSync(testDataRoot, { recursive: true, force: true });
  } catch {
    // Test results matter more than best-effort temporary directory cleanup.
  }
}

process.on("exit", () => {
  cleanTemp();
});
