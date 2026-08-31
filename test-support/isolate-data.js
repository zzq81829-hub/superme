import fs from "fs";
import os from "os";
import path from "path";

// Every test process gets its own disposable data root. This prevents tests that
// exercise approvals, tasks, memory, or the secretary inbox from touching the
// founder's live dashboard data.
const testDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "founder-os-tests-"));

process.env.TASKS_BASE_DIR = path.join(testDataRoot, "task-store");
process.env.MEMORY_BASE_DIR = path.join(testDataRoot, "memory");
process.env.SECRETARY_BASE_DIR = path.join(testDataRoot, "secretary");
process.env.QUOTA_BASE_DIR = path.join(testDataRoot, "quota");
process.env.REVIEWS_BASE_DIR = path.join(testDataRoot, "reviews");
process.env.BRIEF_FILE = path.join(testDataRoot, "BRIEF.md");

process.on("exit", () => {
  try {
    fs.rmSync(testDataRoot, { recursive: true, force: true });
  } catch {
    // Test results matter more than best-effort temporary directory cleanup.
  }
});
