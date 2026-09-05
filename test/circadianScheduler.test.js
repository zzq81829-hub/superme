import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  evaluateCircadianWindow,
  calculateBioJitter,
  selectVerticalHashtags,
  processPublishQueue,
  processQueue,
  calculateNextPublishSlot,
  enqueueQueueItem,
  enqueueContentPackage,
  releaseQueueItem,
  loadSchedulerQueue,
  saveSchedulerQueue,
  CIRCADIAN_WINDOWS,
  QUIET_HOURS
} from "../src/autonomous_content/circadianScheduler.js";

function createDate(hours, minutes, seconds = 0, dayOffset = 0) {
  const d = new Date(2026, 8, 4, hours, minutes, seconds, 0); // Month is 0-indexed (8 = September)
  if (dayOffset !== 0) {
    d.setDate(d.getDate() + dayOffset);
  }
  return d;
}

test("CircadianScheduler R3: evaluateCircadianWindow - Active Lunch Window (11:30~13:30)", () => {
  // Start of lunch window (11:30)
  const dStart = createDate(11, 30, 0);
  const resStart = evaluateCircadianWindow(dStart);
  assert.equal(resStart.allowed, true);
  assert.equal(resStart.isQuietHours, false);
  assert.equal(resStart.suspended, false);
  assert.equal(resStart.windowName, "lunch");
  assert.equal(resStart.targetWindow, "midday_traffic");
  assert.equal(resStart.windowId, "lunch");

  // Mid lunch window (12:30)
  const dMid = createDate(12, 30, 0);
  const resMid = evaluateCircadianWindow(dMid);
  assert.equal(resMid.allowed, true);
  assert.equal(resMid.windowName, "lunch");

  // End of lunch window (13:30)
  const dEnd = createDate(13, 30, 0);
  const resEnd = evaluateCircadianWindow(dEnd);
  assert.equal(resEnd.allowed, true);

  // 1 second after lunch window (13:30:01)
  const dPast = createDate(13, 30, 1);
  const resPast = evaluateCircadianWindow(dPast);
  assert.equal(resPast.allowed, false);
  assert.equal(resPast.reason, "outside_active_window");
  // Next window should be evening 18:00
  assert.equal(resPast.nextAvailableWindow.getHours(), 18);
  assert.equal(resPast.nextAvailableWindow.getMinutes(), 0);
});

test("CircadianScheduler R3: evaluateCircadianWindow - Active Evening Prime-Time (18:00~20:30)", () => {
  // Start of evening window (18:00)
  const dStart = createDate(18, 0, 0);
  const resStart = evaluateCircadianWindow(dStart);
  assert.equal(resStart.allowed, true);
  assert.equal(resStart.windowName, "evening_prime");
  assert.equal(resStart.targetWindow, "evening_golden");
  assert.equal(resStart.isQuietHours, false);

  // 20:00 (the key 8 PM prime slot)
  const dPrime = createDate(20, 0, 0);
  const resPrime = evaluateCircadianWindow(dPrime);
  assert.equal(resPrime.allowed, true);
  assert.equal(resPrime.windowName, "evening_prime");

  // End of evening window (20:30)
  const dEnd = createDate(20, 30, 0);
  const resEnd = evaluateCircadianWindow(dEnd);
  assert.equal(resEnd.allowed, true);

  // 1 second after evening window (20:30:01)
  const dPast = createDate(20, 30, 1);
  const resPast = evaluateCircadianWindow(dPast);
  assert.equal(resPast.allowed, false);
  assert.equal(resPast.reason, "outside_active_window");
  // Next window should be tomorrow lunch 11:30
  assert.equal(resPast.nextAvailableWindow.getHours(), 11);
  assert.equal(resPast.nextAvailableWindow.getMinutes(), 30);
});

test("CircadianScheduler R3: evaluateCircadianWindow - Night Physiological Silence (23:30~08:30)", () => {
  // Start of quiet hours (23:30)
  const d2330 = createDate(23, 30, 0);
  const res2330 = evaluateCircadianWindow(d2330);
  assert.equal(res2330.allowed, false);
  assert.equal(res2330.isQuietHours, true);
  assert.equal(res2330.suspended, true);
  assert.equal(res2330.reason, "night_silence");
  assert.equal(res2330.windowName, null);

  // Deep night (02:30 AM)
  const d0230 = createDate(2, 30, 0);
  const res0230 = evaluateCircadianWindow(d0230);
  assert.equal(res0230.allowed, false);
  assert.equal(res0230.isQuietHours, true);
  assert.equal(res0230.suspended, true);
  assert.equal(res0230.reason, "night_silence");

  // Right before silence ends (08:29:59 AM)
  const d0829 = createDate(8, 29, 59);
  const res0829 = evaluateCircadianWindow(d0829);
  assert.equal(res0829.isQuietHours, true);
  assert.equal(res0829.suspended, true);

  // Exactly at quiet hours boundary (08:30:00 AM) - still suspended
  const d0830 = createDate(8, 30, 0);
  const res0830 = evaluateCircadianWindow(d0830);
  assert.equal(res0830.isQuietHours, true);
  assert.equal(res0830.suspended, true);

  // Past quiet hours (08:30:01 AM)
  const d0831 = createDate(8, 30, 1);
  const res0831 = evaluateCircadianWindow(d0831);
  assert.equal(res0831.isQuietHours, false);
  assert.equal(res0831.suspended, false);
  assert.equal(res0831.allowed, false); // Not quiet hours, but not yet lunch window
  assert.equal(res0831.reason, "outside_active_window");
  assert.equal(res0831.nextAvailableWindow.getHours(), 11);
  assert.equal(res0831.nextAvailableWindow.getMinutes(), 30);
});

test("CircadianScheduler R3: calculateBioJitter - Random bounds and distribution", () => {
  const target = createDate(19, 0, 0);
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const res = calculateBioJitter(target, { clampToWindow: false });
    samples.push(res.jitterMinutes);
    const absJitter = Math.abs(res.jitterMinutes);
    assert.ok(absJitter >= 15, `Jitter magnitude ${absJitter} should be >= 15`);
    assert.ok(absJitter <= 35, `Jitter magnitude ${absJitter} should be <= 35`);
    assert.ok(res.scheduledTime instanceof Date);
  }

  // Verify non-zero variance (not static hardcoded offset)
  const hasPositive = samples.some((j) => j > 0);
  const hasNegative = samples.some((j) => j < 0);
  assert.ok(hasPositive, "BioJitter should produce positive offsets");
  assert.ok(hasNegative, "BioJitter should produce negative offsets");
});

test("CircadianScheduler R3: calculateBioJitter - Window boundary clamping", () => {
  // Evening window is 18:00 to 20:30.
  // Target 20:00 with +35 min jitter would be 20:35 -> must clamp to 20:30
  const targetEveningLate = createDate(20, 0, 0);
  const resClampedMax = calculateBioJitter(targetEveningLate, { jitterMinutes: 35, clampToWindow: true });
  assert.equal(resClampedMax.clamped, true);
  assert.equal(resClampedMax.scheduledTime.getHours(), 20);
  assert.equal(resClampedMax.scheduledTime.getMinutes(), 30);
  assert.equal(resClampedMax.jitterMinutes, 30); // 20:00 -> 20:30 = +30 min

  // Target 18:05 with -20 min jitter would be 17:45 -> must clamp to 18:00
  const targetEveningEarly = createDate(18, 5, 0);
  const resClampedMin = calculateBioJitter(targetEveningEarly, { jitterMinutes: -20, clampToWindow: true });
  assert.equal(resClampedMin.clamped, true);
  assert.equal(resClampedMin.scheduledTime.getHours(), 18);
  assert.equal(resClampedMin.scheduledTime.getMinutes(), 0);
  assert.equal(resClampedMin.jitterMinutes, -5);

  // Lunch window is 11:30 to 13:30.
  // Target 11:30 with -25 min jitter would be 11:05 -> must clamp to 11:30
  const targetLunchEarly = createDate(11, 30, 0);
  const resLunchClamped = calculateBioJitter(targetLunchEarly, { jitterMinutes: -25, clampToWindow: true });
  assert.equal(resLunchClamped.clamped, true);
  assert.equal(resLunchClamped.scheduledTime.getHours(), 11);
  assert.equal(resLunchClamped.scheduledTime.getMinutes(), 30);
  assert.equal(resLunchClamped.jitterMinutes, 0);

  // In-bounds jitter remains unclamped
  const targetSafe = createDate(19, 30, 0);
  const resUnclamped = calculateBioJitter(targetSafe, { jitterMinutes: 15, clampToWindow: true });
  assert.equal(resUnclamped.clamped, false);
  assert.equal(resUnclamped.scheduledTime.getHours(), 19);
  assert.equal(resUnclamped.scheduledTime.getMinutes(), 45);
  assert.equal(resUnclamped.jitterMinutes, 15);
});

test("CircadianScheduler R3: selectVerticalHashtags - Quantity invariants and prefix formatting", () => {
  // Test count variations
  const tags4 = selectVerticalHashtags({ count: 4 });
  assert.equal(tags4.length, 4);

  const tags3 = selectVerticalHashtags({ count: 3 });
  assert.equal(tags3.length, 3);

  const tags5 = selectVerticalHashtags({ count: 5 });
  assert.equal(tags5.length, 5);

  // Clamped out of bounds
  const tagsUnder = selectVerticalHashtags({ count: 1 });
  assert.equal(tagsUnder.length, 3, "Count < 3 should clamp to 3");

  const tagsOver = selectVerticalHashtags({ count: 10 });
  assert.equal(tagsOver.length, 5, "Count > 5 should clamp to 5");

  // Verify prefix formatting
  for (const tag of tags4) {
    assert.ok(tag.startsWith("#"), `Tag ${tag} must start with '#'`);
    assert.ok(!/\s/.test(tag), `Tag ${tag} must not contain whitespace`);
  }
});

test("CircadianScheduler R3: selectVerticalHashtags - Domain relevance matching", () => {
  // Wealth & Business topic
  const wealthTags = selectVerticalHashtags({
    category: "搞钱商业",
    keywords: ["副业变现", "商业模式", "资产"],
    contentText: "普通人如何抓住AI轻资产创业机会？底层逻辑就在这3点",
    count: 4
  });
  assert.ok(wealthTags.length >= 3 && wealthTags.length <= 5);
  assert.ok(wealthTags.some((t) => ["#搞钱", "#搞钱思维", "#商业认知", "#副业搞钱", "#商业模式"].includes(t)));

  // Booklist topic
  const bookTags = selectVerticalHashtags({
    category: "书单推荐",
    keywords: ["深度阅读", "经典好书"],
    contentText: "读完这5本认知觉醒的书，彻底告别精神内耗",
    count: 4
  });
  assert.ok(bookTags.some((t) => ["#书单", "#读书笔记", "#书单推荐", "#经典好书", "#阅读分享"].includes(t)));

  // Cognitive Thinking topic
  const cogTags = selectVerticalHashtags({
    category: "认知思维",
    keywords: ["底层逻辑", "认知差"],
    contentText: "为什么高手都在用逆向思维？",
    count: 4
  });
  assert.ok(cogTags.some((t) => ["#认知思维", "#底层逻辑", "#思维跃迁", "#逆向思维", "#认知破局"].includes(t)));
});

test("CircadianScheduler R3: processPublishQueue - Night silence suspension", async () => {
  const tmpQueuePath = path.join(os.tmpdir(), `test_queue_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    // Add item that is due
    const item = enqueueQueueItem(
      {
        id: "test_night_item",
        scheduledTime: createDate(2, 0, 0).toISOString(),
        title: "Night test note",
        gateMode: "auto"
      },
      { queuePath: tmpQueuePath }
    );

    let publishCallbackCalled = false;
    // Process queue at 02:30 AM (during night physiological silence)
    const result = await processPublishQueue({
      queuePath: tmpQueuePath,
      gateMode: "auto",
      now: createDate(2, 30, 0),
      onPublishCallback: async () => {
        publishCallbackCalled = true;
      }
    });

    assert.equal(result.suspended, true);
    assert.equal(result.reason, "night_silence");
    assert.equal(result.released.length, 0, "No items should be released during night silence");
    assert.equal(publishCallbackCalled, false, "Publish callback must not be invoked during night silence");
  } finally {
    try {
      fs.rmSync(tmpQueuePath, { force: true });
    } catch {}
  }
});

test("CircadianScheduler R3: processPublishQueue - Dual-Mode Gate: Auto vs Manual Buffer", async () => {
  const tmpQueuePath = path.join(os.tmpdir(), `test_queue_gate_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    const activeTime = createDate(19, 0, 0); // 19:00 (active evening window)

    // Item 1: Auto gate mode, due now
    enqueueQueueItem(
      {
        id: "item_auto_due",
        scheduledTime: createDate(18, 30, 0).toISOString(),
        title: "Auto due note",
        gateMode: "auto",
        compliancePassed: true
      },
      { queuePath: tmpQueuePath }
    );

    // Item 2: Manual buffer mode, due now (unapproved)
    enqueueQueueItem(
      {
        id: "item_manual_buffer",
        scheduledTime: createDate(18, 45, 0).toISOString(),
        title: "Manual buffer note",
        gateMode: "manual_buffer",
        compliancePassed: true
      },
      { queuePath: tmpQueuePath }
    );

    // Item 3: Auto mode, scheduled in future
    enqueueQueueItem(
      {
        id: "item_future",
        scheduledTime: createDate(20, 15, 0).toISOString(),
        title: "Future note",
        gateMode: "auto",
        compliancePassed: true
      },
      { queuePath: tmpQueuePath }
    );

    // Item 4: Auto mode, due now, but compliance failed
    enqueueQueueItem(
      {
        id: "item_noncompliant",
        scheduledTime: createDate(18, 15, 0).toISOString(),
        title: "Noncompliant note",
        gateMode: "auto",
        compliancePassed: false
      },
      { queuePath: tmpQueuePath }
    );

    const publishedIds = [];
    const run1 = await processPublishQueue({
      queuePath: tmpQueuePath,
      gateMode: "auto",
      now: activeTime,
      onPublishCallback: async (item) => {
        publishedIds.push(item.id);
      }
    });

    assert.equal(run1.suspended, false);
    // Auto due item should be released
    assert.equal(run1.released.length, 1);
    assert.equal(run1.released[0].id, "item_auto_due");
    assert.deepEqual(publishedIds, ["item_auto_due"]);

    // Manual buffer item should be buffered, not released
    assert.equal(run1.buffered.length, 1);
    assert.equal(run1.buffered[0].id, "item_manual_buffer");

    // Future and noncompliant items should be skipped
    assert.equal(run1.skipped.length, 2);
    const skippedReasons = run1.skipped.map((s) => s.reason);
    assert.ok(skippedReasons.includes("scheduled_in_future"));
    assert.ok(skippedReasons.includes("compliance_blocked"));

    // Check queue state on disk
    const queueAfterRun1 = loadSchedulerQueue(tmpQueuePath);
    const manualItem = queueAfterRun1.find((it) => it.id === "item_manual_buffer");
    assert.equal(manualItem.status, "awaiting_manual_approval");

    // Now founder calls releaseQueueItem on the buffered item
    const releaseRes = releaseQueueItem("item_manual_buffer", { queuePath: tmpQueuePath });
    assert.equal(releaseRes.success, true);
    assert.equal(releaseRes.item.status, "ready_to_publish");
    assert.equal(releaseRes.item.founderApproved, true);

    // Run queue processor again
    const run2 = await processPublishQueue({
      queuePath: tmpQueuePath,
      gateMode: "auto",
      now: activeTime,
      onPublishCallback: async (item) => {
        publishedIds.push(item.id);
      }
    });

    // The approved manual item should now be released
    assert.equal(run2.released.length, 1);
    assert.equal(run2.released[0].id, "item_manual_buffer");
    assert.ok(publishedIds.includes("item_manual_buffer"));
  } finally {
    try {
      fs.rmSync(tmpQueuePath, { force: true });
    } catch {}
  }
});

test("CircadianScheduler R3: processQueue alias and calculateNextPublishSlot", async () => {
  const slotLunch = calculateNextPublishSlot(createDate(9, 0, 0));
  assert.ok(slotLunch.scheduledTime instanceof Date);
  assert.equal(slotLunch.targetWindow, "lunch");

  const slotEvening = calculateNextPublishSlot(createDate(15, 0, 0));
  assert.ok(slotEvening.scheduledTime instanceof Date);
  assert.equal(slotEvening.targetWindow, "evening_prime");

  // Test processQueue alias
  const tmpQueuePath = path.join(os.tmpdir(), `test_alias_${Date.now()}.json`);
  try {
    const res = await processQueue({ queuePath: tmpQueuePath, now: createDate(12, 0, 0) });
    assert.ok(Array.isArray(res.released));
    assert.ok(Array.isArray(res.buffered));
    assert.ok(Array.isArray(res.skipped));
  } finally {
    try {
      fs.rmSync(tmpQueuePath, { force: true });
    } catch {}
  }
});
