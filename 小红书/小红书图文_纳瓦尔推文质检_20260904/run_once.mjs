import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAutonomousContentPipeline } from "../../src/autonomous_content/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, "seed.json"), "utf8"));

const result = await runAutonomousContentPipeline({
  rawTopic: `${seed.thread_title}: ${seed.claims.join(" ")}`,
  sourceUrl: seed.source_url,
  metrics: { threadLength: seed.thread_length, publishedAt: seed.published_at },
  rawClaims: [
    "绝对不能靠出租时间致富，所有人都必须拥有公司股权。",
    "代码和媒体是无需许可的杠杆。",
    "专长无法被外包或自动化。",
    "阅读比听更快，亲手做比观看更快。",
    "100% 不存在快速致富方案，承诺暴富的人只是在赚你的钱。"
  ],
  factCheck: true,
  originalTweetMedia: {
    type: "verified_text_reconstruction",
    sourceUrl: seed.source_url,
    archiveUrl: seed.archive_url
  },
  ctaType: "book",
  ctaConfig: {
    bookTitle: "《纳瓦尔宝典》",
    corePitch: "先看清工资、所有权与杠杆的边界，再决定自己该积累什么。",
    callToAction: "通过小红书官方好物卡了解本书"
  },
  gateMode: "manual_buffer",
  now: "2026-09-04T12:00:00+08:00",
  queuePath: path.join(here, "pipeline-queue.json"),
  auditPath: path.join(here, "pipeline-audit.jsonl"),
  ledgerPath: path.join(here, "empty-ledger.jsonl"),
  noteId: "naval-x-factcheck-20260904"
});

fs.writeFileSync(path.join(here, "pipeline-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  success: result.success,
  pipelineStep: result.pipelineStep,
  compliancePassed: result.complianceResult?.passed,
  riskLevel: result.complianceResult?.riskLevel,
  queueStatus: result.scheduleResult?.queueItem?.status,
  publishReleased: (result.scheduleResult?.publishResult?.released || []).length,
  slideCount: result.adaptedNote?.slidePlan?.length,
  monetizationType: result.adaptedNote?.monetizationType
}, null, 2));
