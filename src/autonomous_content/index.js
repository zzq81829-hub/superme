/**
 * Unified Autonomous Content Facade & Pipeline Engine (一人内容公司 - 统一中枢外构)
 *
 * Exposes the end-to-end autonomous content operation pipeline connecting:
 * - R1: Trend Sniffer & Cultural Adaptation Engine (zero-MT feel, 3s hooks, fact-checking)
 * - R2: Two-tier Compliance & Legality Firewall (100% intercept, >=98% safe pass, audit log)
 * - R3: Circadian Anti-Ban Scheduler & Hashtag Pipeline (11:30~13:30, 18:00~20:30, BioJitter ±15~35m)
 * - R4: 9-Metric Learning Ledger & Peer Adaptation (hard metrics, funnel diagnosis, closed-loop)
 * - R5: Personal IP Discovery & Pluggable Monetization CTAs (books, toolkits, consultations)
 */

import crypto from "crypto";

// Submodule imports
import * as culturalAdaptationModule from "./culturalAdaptation.js";
import * as complianceFirewallModule from "./complianceFirewall.js";
import * as circadianSchedulerModule from "./circadianScheduler.js";
import * as learningLedgerModule from "./learningLedger.js";
import * as ipDiscoveryModule from "./ipDiscovery.js";

// Re-export submodule namespaces
export const culturalAdaptation = culturalAdaptationModule;
export const complianceFirewall = complianceFirewallModule;
export const circadianScheduler = circadianSchedulerModule;
export const learningLedger = learningLedgerModule;
export const ipDiscovery = ipDiscoveryModule;

// Re-export all named submodule exports
export * from "./culturalAdaptation.js";
export * from "./complianceFirewall.js";
export * from "./circadianScheduler.js";
export * from "./learningLedger.js";
export * from "./ipDiscovery.js";

// Destructured core utilities for pipeline execution
const {
  adaptOverseasTopic,
  packageContentMetadata
} = culturalAdaptationModule;

const {
  evaluateCompliance
} = complianceFirewallModule;

const {
  calculateBioJitter,
  selectVerticalHashtags,
  calculateNextPublishSlot,
  enqueueQueueItem,
  processPublishQueue
} = circadianSchedulerModule;

const {
  getLatestStrategyVector,
  recordCycleExperiment,
  DEFAULT_STRATEGY_VECTOR
} = learningLedgerModule;

const {
  injectMonetizationCTA
} = ipDiscoveryModule;

/**
 * Executes the end-to-end autonomous content generation, compliance, and scheduling pipeline.
 *
 * Workflow:
 * 1. Ingests latest strategy vector from Learning Ledger (`data/learning/ledger.jsonl`).
 * 2. Ingests & culturally adapts raw topic / claims via Cultural Adaptation Engine.
 * 3. Injects pluggable monetization hook (book recommendation, toolkit, or consultation) via IP Discovery.
 * 4. Runs two-tier Compliance Firewall; logs audit record. If blocked, returns quarantined package.
 * 5. If compliant, selects 3-5 vertical hashtags and enqueues to Circadian Scheduler with BioJitter (±15~35 min).
 * 6. If gateMode === 'auto', immediately triggers queue processing within circadian traffic window.
 *
 * @param {object} options
 * @param {string} options.rawTopic - Overseas viral topic or content seed
 * @param {string} [options.sourceUrl] - Original source URL (e.g. X/Twitter)
 * @param {object} [options.metrics] - Engagement metrics of source post
 * @param {string} [options.targetPersona] - Target audience persona override
 * @param {string[]} [options.rawClaims] - Overseas factual claims for fact-checking
 * @param {boolean} [options.factCheck] - Whether to activate fact-check & mythbusting mode
 * @param {object} [options.originalTweetMedia] - Original tweet media reference
 * @param {object} [options.strategyOverrides] - Ad-hoc overrides for strategy vector
 * @param {string} [options.ctaType] - CTA hook type ('book'|'toolkit'|'consultation'|'checklist')
 * @param {object} [options.ctaConfig] - Configuration details for the CTA
 * @param {'auto'|'manual_buffer'} [options.gateMode='auto'] - Publishing gate mode
 * @param {Date|string} [options.targetTime] - Desired release time before BioJitter
 * @param {Date|string} [options.now] - Current time override for deterministic testing
 * @param {string} [options.queuePath] - Custom path for scheduler queue persistence
 * @param {string} [options.auditPath] - Custom path for compliance audit log persistence
 * @param {string} [options.ledgerPath] - Custom path for learning ledger persistence
 * @param {function} [options.onPublishCallback] - Callback executed upon successful note release
 * @returns {Promise<{
 *   success: boolean,
 *   pipelineStep: string,
 *   adaptedNote: object|null,
 *   complianceResult: object|null,
 *   scheduleResult: object|null,
 *   auditLog: object|null,
 *   quarantinedPackage?: object
 * }>}
 */
export async function runAutonomousContentPipeline(options = {}) {
  if (!options || typeof options !== "object") {
    throw new Error("runAutonomousContentPipeline requires an options object");
  }

  const rawTopic = options.rawTopic || options.topic;
  if (!rawTopic || !String(rawTopic).trim()) {
    throw new Error("rawTopic must be a non-empty string");
  }

  // -------------------------------------------------------------------------
  // 1. Retrieve Latest Strategy Vector (Closed-Loop Experience Feedback)
  // -------------------------------------------------------------------------
  const ledgerOptions = options.ledgerPath ? { ledgerPath: options.ledgerPath } : {};
  let strategyVector = DEFAULT_STRATEGY_VECTOR;
  try {
    const latest = getLatestStrategyVector(ledgerOptions);
    if (latest && typeof latest === "object") {
      strategyVector = latest;
    }
  } catch {
    strategyVector = DEFAULT_STRATEGY_VECTOR;
  }

  const mergedStrategy = {
    ...strategyVector,
    ...(options.strategyOverrides || {})
  };

  // -------------------------------------------------------------------------
  // 2. Cultural Adaptation & Fact-Checking Engine
  // -------------------------------------------------------------------------
  const isFactCheck = Boolean(
    options.factCheck ||
    (Array.isArray(options.rawClaims) && options.rawClaims.length > 0)
  );

  const adaptationOptions = {
    rawTopic: String(rawTopic).trim(),
    sourceUrl: options.sourceUrl,
    metrics: options.metrics,
    targetPersona: options.targetPersona || mergedStrategy.targetPersona,
    strategyOverrides: mergedStrategy,
    rawClaims: options.rawClaims,
    factCheck: isFactCheck,
    originalTweetMedia: options.originalTweetMedia
  };

  const adaptationResult = await adaptOverseasTopic(adaptationOptions);
  if (!adaptationResult || !adaptationResult.success || !adaptationResult.adaptedNote) {
    return {
      success: false,
      pipelineStep: "cultural_adaptation",
      error: adaptationResult?.error || "Cultural adaptation failed",
      adaptedNote: null,
      complianceResult: null,
      scheduleResult: null,
      auditLog: null
    };
  }

  let adaptedNote = { ...adaptationResult.adaptedNote };

  // -------------------------------------------------------------------------
  // 3. Monetization CTA Hook Injection
  // -------------------------------------------------------------------------
  const ctaType = options.ctaType || options.cta?.type || options.monetization?.type || (options.monetize !== false ? mergedStrategy.preferredCta : null);
  const ctaConfig = options.ctaConfig || options.cta?.config || options.monetization?.config || options.monetization || {};

  if (ctaType) {
    const monetized = injectMonetizationCTA(adaptedNote, ctaType, ctaConfig);
    adaptedNote = {
      ...adaptedNote,
      title: monetized.title || adaptedNote.title,
      body: monetized.enhancedBody || adaptedNote.body,
      enhancedBody: monetized.enhancedBody,
      ctaSlide: monetized.ctaSlide,
      ctaSlides: monetized.ctaSlides,
      slides: monetized.slides,
      isMonetized: true,
      monetizationType: monetized.monetizationType,
      monetizationConfig: monetized.monetizationConfig
    };

    if (Array.isArray(adaptedNote.slidePlan) && monetized.ctaSlide) {
      const alreadyHasCta = adaptedNote.slidePlan.some((s) => s.role === "monetization_cta");
      if (!alreadyHasCta) {
        adaptedNote.slidePlan = [...adaptedNote.slidePlan, monetized.ctaSlide];
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Two-Tier Compliance Firewall & Audit Logger
  // -------------------------------------------------------------------------
  const complianceOptions = {
    recordLog: true,
    auditPath: options.auditPath
  };

  const complianceResult = evaluateCompliance({
    title: adaptedNote.title,
    body: adaptedNote.body,
    tags: adaptedNote.tags,
    slides: adaptedNote.slidePlan || adaptedNote.slides
  }, complianceOptions);

  const auditLog = complianceResult.auditRecord || null;

  // Intercept violations and isolate quarantined package
  if (!complianceResult.passed || complianceResult.riskLevel === "blocked") {
    const quarantinedPackage = {
      status: "quarantined",
      noteId: options.noteId || `note_quarantine_${Date.now()}`,
      quarantineReason: [
        ...(complianceResult.tier1Violations || []),
        ...(complianceResult.tier2Violations || [])
      ],
      quarantinedAt: new Date().toISOString(),
      adaptedNote,
      complianceResult,
      auditLog
    };

    return {
      success: false,
      pipelineStep: "compliance_firewall",
      adaptedNote,
      complianceResult,
      scheduleResult: null,
      auditLog,
      quarantinedPackage
    };
  }

  // -------------------------------------------------------------------------
  // 5. Vertical Hashtag Taxonomy & Metadata Packaging
  // -------------------------------------------------------------------------
  const selectedTags = selectVerticalHashtags({
    keywords: options.keywords || [adaptedNote.title, ...(adaptedNote.tags || [])],
    contentText: adaptedNote.body,
    category: options.category || "认知思维",
    count: options.tagCount || 4
  });
  adaptedNote.tags = selectedTags;

  const packaged = packageContentMetadata({
    title: adaptedNote.title,
    body: adaptedNote.body,
    tags: selectedTags,
    slidePlan: adaptedNote.slidePlan || adaptedNote.slides
  });
  adaptedNote.formattedCaption = packaged.formattedCaption;

  // -------------------------------------------------------------------------
  // 6. Circadian Anti-Ban Scheduling with BioJitter
  // -------------------------------------------------------------------------
  const nowDate = options.now instanceof Date
    ? options.now
    : (options.now ? new Date(options.now) : new Date());

  let scheduledTime;
  let jitterMinutes;

  if (options.targetTime || options.scheduledTime) {
    const rawTarget = options.targetTime || options.scheduledTime;
    const baseTargetTime = rawTarget instanceof Date ? rawTarget : new Date(rawTarget);
    const jitterResult = calculateBioJitter(baseTargetTime, { now: nowDate, ...options.jitterOptions });
    scheduledTime = jitterResult.scheduledTime;
    jitterMinutes = jitterResult.jitterMinutes;
  } else {
    const slotResult = calculateNextPublishSlot(nowDate, options.jitterOptions);
    scheduledTime = slotResult.scheduledTime;
    jitterMinutes = slotResult.jitterMinutes;
  }

  const gateMode = options.gateMode || "auto";
  const noteId = options.noteId || `note_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const queueItem = {
    id: noteId,
    title: adaptedNote.title,
    body: adaptedNote.body,
    tags: adaptedNote.tags,
    slidePlan: adaptedNote.slidePlan || adaptedNote.slides,
    formattedCaption: adaptedNote.formattedCaption,
    scheduledTime: scheduledTime.toISOString(),
    jitterMinutes,
    gateMode,
    compliancePassed: complianceResult.passed,
    status: gateMode === "manual_buffer" ? "awaiting_manual_approval" : "ready",
    createdAt: nowDate.toISOString()
  };

  const queueRes = enqueueQueueItem(queueItem, { queuePath: options.queuePath });

  // -------------------------------------------------------------------------
  // 7. Gate Mode Execution (Auto Publishing vs Manual Buffer Holding)
  // -------------------------------------------------------------------------
  let publishResult = null;
  if (gateMode === "auto") {
    publishResult = await processPublishQueue({
      queuePath: options.queuePath,
      gateMode: "auto",
      now: nowDate,
      onPublishCallback: options.onPublishCallback,
      forcePublish: Boolean(options.forcePublish)
    });
  } else if (gateMode === "manual_buffer") {
    publishResult = await processPublishQueue({
      queuePath: options.queuePath,
      gateMode: "manual_buffer",
      now: nowDate
    });
  }

  const scheduleResult = {
    scheduledTime,
    jitterMinutes,
    queueItem,
    enqueued: queueRes.enqueued,
    queuePath: queueRes.queuePath,
    publishResult
  };

  return {
    success: true,
    pipelineStep: "completed",
    adaptedNote,
    complianceResult,
    scheduleResult,
    auditLog
  };
}

/**
 * Records post-publication feedback metrics for closed-loop learning attribution.
 * Persists results to the Learning Ledger and updates the active strategy vector.
 *
 * @param {object} params
 * @param {string} params.cycleId - Unique operational cycle ID
 * @param {string} [params.noteId] - Published note identifier
 * @param {object} params.metrics - 9 objective funnel metrics
 * @param {object} [params.variables] - Content variables tested in this cycle
 * @param {object} [params.options] - Persistence options (e.g. ledgerPath, strategyPath)
 * @returns {object} Ledger entry and updated strategy state
 */
export function recordPostPublicationFeedback({
  cycleId,
  noteId,
  metrics,
  variables,
  options = {}
} = {}) {
  return recordCycleExperiment(
    {
      cycleId,
      noteId,
      metrics,
      variables
    },
    options
  );
}

// Default export
export default {
  runAutonomousContentPipeline,
  recordPostPublicationFeedback,
  culturalAdaptation,
  complianceFirewall,
  circadianScheduler,
  learningLedger,
  ipDiscovery
};
