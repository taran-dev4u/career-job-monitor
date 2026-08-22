import assert from "node:assert/strict";
import { buildHealthAlertPayload, buildJobPayload, buildOverflowPayload, sendBatchNotifications } from "../src/notify_ntfy.mjs";

const sampleJob = {
  role: "Software Engineer",
  company: "Apple Inc",
  location: "Cupertino, CA, US",
  sponsorship_status: "Available",
  posted: "Aug 22, 2026",
  job_url: "https://jobs.apple.com/en-us/details/12345"
};

// 1. Job payload construction
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

// 2. Overflow payload construction
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

// 3. Health alert payload construction
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

// 4. Batch sender without topic (skips cleanly)
const noTopicResult = await sendBatchNotifications({
  batch: { jobs: [sampleJob] },
  topic: ""
});
assert.equal(noTopicResult.skipped, true);
assert.equal(noTopicResult.reason, "NO_TOPIC");

// 5. Batch sender with empty batch (skips cleanly)
const emptyResult = await sendBatchNotifications({
  batch: { jobs: [], health_alerts: [] },
  topic: "test-topic"
});
assert.equal(emptyResult.skipped, true);
assert.equal(emptyResult.reason, "EMPTY_BATCH");

// 6. Batch sender with mock fetch
const sentPayloads = [];
const mockFetch = async (server, payload, token) => {
  sentPayloads.push({ server, payload, token });
  return { id: "msg_123" };
};

const sendResult = await sendBatchNotifications({
  batch: {
    jobs: [sampleJob, { role: "ML Engineer", company: "Intel", job_url: "https://intel.com/1" }],
    health_alerts: [{ company: "Oracle", status: "Degraded", diagnostic: "Check auth" }]
  },
  topic: "my-career-topic",
  server: "https://ntfy.sh",
  token: "my-token",
  fetchFn: mockFetch
});

assert.equal(sendResult.ok, 2);
assert.equal(sendResult.total, 2);
assert.equal(sendResult.alerts, 1);
assert.equal(sentPayloads.length, 3);
assert.equal(sentPayloads[0].payload.topic, "my-career-topic");
assert.equal(sentPayloads[0].token, "my-token");
assert.ok(sentPayloads[0].payload.title.includes("🎯"));
assert.ok(sentPayloads[2].payload.title.includes("⚠️"));

// 7. Error resilience (individual push failure does not break the batch)
let attempt = 0;
const failingFetch = async () => {
  attempt++;
  if (attempt === 1) throw new Error("Simulated network glitch");
  return { id: "msg_ok" };
};

const resilientResult = await sendBatchNotifications({
  batch: {
    jobs: [sampleJob, { role: "DevOps Engineer", company: "IBM", job_url: "https://ibm.com/2" }]
  },
  topic: "my-career-topic",
  fetchFn: failingFetch
});
assert.equal(resilientResult.ok, 1);
assert.equal(resilientResult.total, 2);

console.log("ntfy notification tests passed.");
