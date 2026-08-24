import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildHealthAlertPayload, buildJobPayload, buildOverflowPayload, sendBatchNotifications } from "../src/notify_ntfy.mjs";
import { formatReleaseTimeline, formatScanIntervalWindow } from "../src/lib.mjs";

const nowIso = new Date().toISOString();
const sampleJob = {
  role: "Software Engineer",
  company: "Apple Inc",
  company_id: "CMP-004",
  location: "Cupertino, CA, US",
  sponsorship_status: "Available",
  posted: nowIso,
  discovered_at: nowIso,
  discovery_window_start: nowIso,
  job_url: "https://jobs.apple.com/en-us/details/12345"
};

// 1. Release timeline formatting
const exactTimeline = formatReleaseTimeline("2026-08-22T06:15:00.000Z", "2026-08-22T06:37:00.000Z", "2026-08-22T06:07:00.000Z");
assert.ok(exactTimeline.posted_display.includes("Aug 22, 2026"));
assert.ok(exactTimeline.posted_display.includes("6:15 AM UTC"));
assert.ok(exactTimeline.discovery_window.includes("6:07 AM – 6:37 AM UTC"));

const relativeTimeline = formatReleaseTimeline("Recently posted", "2026-08-22T06:37:00.000Z", "2026-08-22T06:07:00.000Z");
assert.equal(relativeTimeline.posted_display, "Recently posted");
assert.ok(relativeTimeline.discovery_window.includes("6:07 AM – 6:37 AM UTC"));

// 2. Job payload construction
const jobPayload = buildJobPayload(sampleJob, "test-topic");
assert.equal(jobPayload.topic, "test-topic");
assert.ok(jobPayload.title.includes("🎯"));
assert.ok(jobPayload.title.includes("Software Engineer"));
assert.ok(jobPayload.title.includes("Apple Inc"));
assert.ok(jobPayload.message.includes("Cupertino, CA, US"));
assert.ok(jobPayload.message.includes("Available"));
assert.equal(jobPayload.markdown, true);
assert.equal(jobPayload.priority, 4);
assert.deepEqual(jobPayload.tags, ["briefcase", "sparkles"]);
assert.equal(jobPayload.click, "https://jobs.apple.com/en-us/details/12345");
assert.equal(jobPayload.actions[0].action, "view");
assert.equal(jobPayload.actions[0].label, "🚀 Apply Now");
assert.equal(jobPayload.actions[0].url, "https://jobs.apple.com/en-us/details/12345");
assert.equal(jobPayload.actions[1].action, "copy");
assert.equal(jobPayload.actions[1].label, "📋 Copy Job Link");
assert.equal(jobPayload.actions[1].value, "https://jobs.apple.com/en-us/details/12345");

// 3. Overflow payload construction
const overflowJobs = [
  { role: "Backend Engineer", company: "Meta", job_url: "https://meta.com/1" },
  { role: "AI Engineer", company: "Google", job_url: "https://google.com/2" }
];
const overflowPayload = buildOverflowPayload(overflowJobs, 0, "test-topic");
assert.equal(overflowPayload.topic, "test-topic");
assert.ok(overflowPayload.title.includes("+2 More New Roles"));
assert.ok(overflowPayload.message.includes("Backend Engineer"));
assert.ok(overflowPayload.message.includes("Meta"));
assert.equal(overflowPayload.markdown, true);
assert.equal(overflowPayload.priority, 3);
assert.deepEqual(overflowPayload.tags, ["sparkles", "star"]);

// 4. Health alert payload construction
const alerts = [
  { company: "Apple Inc", status: "Degraded", diagnostic: "Timeout" },
  { company: "Google LLC", status: "Broken", diagnostic: "HTTP 500" }
];
const healthPayload = buildHealthAlertPayload(alerts, "test-topic");
assert.equal(healthPayload.topic, "test-topic");
assert.ok(healthPayload.title.includes("⚠️"));
assert.ok(healthPayload.title.includes("2 Career Source(s)"));
assert.ok(healthPayload.message.includes("Apple Inc"));
assert.ok(healthPayload.message.includes("Google LLC"));
assert.equal(healthPayload.priority, 2);
assert.deepEqual(healthPayload.tags, ["warning", "rotating_light"]);

// 5. Batch sender without topic (skips cleanly)
const noTopicResult = await sendBatchNotifications({
  batch: { jobs: [sampleJob] },
  topic: ""
});
assert.equal(noTopicResult.skipped, true);
assert.equal(noTopicResult.reason, "NO_TOPIC");

// 6. Batch sender with empty batch (skips cleanly)
const emptyResult = await sendBatchNotifications({
  batch: { jobs: [], health_alerts: [] },
  topic: "test-topic"
});
assert.equal(emptyResult.skipped, true);
assert.equal(emptyResult.reason, "EMPTY_BATCH");

// 7. Batch sender with mock fetch and push deduplication test
const tempLog = path.join(os.tmpdir(), `pushed_test_${Date.now()}.json`);
const sentPayloads = [];
const mockFetch = async (server, payload, token) => {
  sentPayloads.push({ server, payload, token });
  return { id: "msg_123" };
};

const sendResult = await sendBatchNotifications({
  batch: {
    jobs: [sampleJob, { role: "ML Engineer", company: "Intel", company_id: "CMP-009", job_id: "int-1", job_url: "https://intel.com/1" }],
    health_alerts: [{ company: "Oracle", status: "Degraded", diagnostic: "Check auth" }]
  },
  topic: "my-career-topic",
  server: "https://ntfy.sh",
  token: "my-token",
  fetchFn: mockFetch,
  pushedLogPath: tempLog
});

assert.equal(sendResult.ok, 2);
assert.equal(sendResult.total, 2);
assert.equal(sendResult.alerts, 1);
assert.equal(sentPayloads.length, 3);

// 8. Deduplication verification: re-running with the SAME jobs should skip all jobs!
const secondRunResult = await sendBatchNotifications({
  batch: {
    jobs: [sampleJob, { role: "ML Engineer", company: "Intel", company_id: "CMP-009", job_id: "int-1", job_url: "https://intel.com/1" }]
  },
  topic: "my-career-topic",
  fetchFn: mockFetch,
  pushedLogPath: tempLog
});
assert.equal(secondRunResult.skipped, true);
assert.equal(secondRunResult.reason, "EMPTY_BATCH");

// 9. Strict US Location & Date Freshness gating test
const testNonUsLog = path.join(os.tmpdir(), `pushed_test_nonus_${Date.now()}.json`);
const filteredResult = await sendBatchNotifications({
  batch: {
    jobs: [
      { role: "Dublin Engineer", company: "Google", company_id: "CMP-003", location: "Dublin, Ireland", job_id: "dub-1", job_url: "https://google.com/1", posted: nowIso },
      { role: "Old Engineer", company: "Meta", company_id: "CMP-002", location: "Menlo Park, CA", job_id: "meta-old", job_url: "https://meta.com/1", posted: "2026-04-09T00:00:00Z" },
      { role: "Valid Fresh US Engineer", company: "Apple", company_id: "CMP-004", location: "Cupertino, CA, USA", job_id: "app-fresh", job_url: "https://apple.com/fresh", posted: nowIso }
    ]
  },
  topic: "my-career-topic",
  fetchFn: mockFetch,
  pushedLogPath: testNonUsLog
});
// The Dublin job is rejected on location. The fresh Apple job is pushed as
// news. The old Meta job has NEVER been pushed before, so it earns exactly one
// catch-up alert rather than being silently dropped forever - monitor.mjs marks
// a job notified on first sight whether or not a push went out, so suppressing
// a first sighting on age meant it was never offered again.
assert.equal(filteredResult.ok, 2, "fresh US job + one catch-up for the never-pushed older job");

// 9b. An older job that HAS already been pushed must stay suppressed.
const testCatchUpLog = path.join(os.tmpdir(), `pushed_test_catchup_${Date.now()}.json`);
const oldJob = { role: "Old Engineer", company: "Meta", company_id: "CMP-002", location: "Menlo Park, CA", job_id: "meta-old", job_url: "https://meta.com/1", posted: "2026-04-09T00:00:00Z" };
const firstSighting = await sendBatchNotifications({ batch: { jobs: [oldJob] }, topic: "t", fetchFn: mockFetch, pushedLogPath: testCatchUpLog });
assert.equal(firstSighting.ok, 1, "first sighting of an old job gets one catch-up push");
const secondSighting = await sendBatchNotifications({ batch: { jobs: [oldJob] }, topic: "t", fetchFn: mockFetch, pushedLogPath: testCatchUpLog });
assert.equal(secondSighting.ok, 0, "the same old job must not be pushed twice");

// 10. Overflow must be DEFERRED to the next run, never discarded.
// A real run added 48 new jobs; with a hard cap of 20 and a summary naming only
// 15 more, 13 jobs reached the user as a bare number and were never offered
// again because monitor.mjs had already marked them notified.
const overflowLog = path.join(os.tmpdir(), `pushed_test_overflow_${Date.now()}.json`);
const carryPath = path.join(os.tmpdir(), `pending_push_${Date.now()}.json`);
const manyJobs = Array.from({ length: 48 }, (_, i) => ({
  role: `Software Engineer ${i}`, company: "Amazon", company_id: "CMP-001",
  location: "Seattle, WA", job_id: `amz-${i}`, job_url: `https://amazon.com/${i}`, posted: nowIso
}));
const overflowRun = await sendBatchNotifications({
  batch: { jobs: manyJobs }, topic: "t", fetchFn: mockFetch,
  pushedLogPath: overflowLog, carryOverPath: carryPath
});
assert.equal(overflowRun.ok, 20, "first run pushes the per-run maximum");
assert.equal(overflowRun.deferred, 28, "the remaining 28 are deferred, not dropped");
const carried = JSON.parse(await fsp.readFile(carryPath, "utf8"));
assert.equal(carried.jobs.length, 28, "deferred jobs are persisted for the next run");

// The next run must drain the queue from the front, not re-push what already went.
const drainRun = await sendBatchNotifications({
  batch: { jobs: [] }, topic: "t", fetchFn: mockFetch,
  pushedLogPath: overflowLog, carryOverPath: carryPath
});
assert.equal(drainRun.ok, 20, "the next run continues draining the deferred queue");
const stillCarried = JSON.parse(await fsp.readFile(carryPath, "utf8"));
assert.equal(stillCarried.jobs.length, 8, "queue shrinks until it is empty");

// 11. A critical source-audit finding must reach the phone, not just the log.
const auditLog = path.join(os.tmpdir(), `pushed_test_audit_${Date.now()}.json`);
const auditRun = await sendBatchNotifications({
  batch: { jobs: [], health_alerts: [], audit_alerts: [
    { company_id: "CMP-001", company: "Amazon", severity: "critical", code: "LOCATION_EXTRACTION_DEAD", message: "location blank on all 30 candidates", evidence: "" }
  ] },
  topic: "t", fetchFn: mockFetch, pushedLogPath: auditLog
});
assert.equal(auditRun.auditAlerts, 1, "a broken source must generate a push");

console.log("ntfy notification, location, freshness, deduplication, catch-up, overflow-carryover & source-audit tests passed.");
