// Watchdog tests.
//
// The monitor went dark for 49h and 42h in a single week without anything
// failing. These tests pin the detector shut so a blackout can never again be
// indistinguishable from "no new jobs today".

import assert from "node:assert/strict";
import { assessRunFreshness, buildWatchdogPayload } from "../src/watchdog.mjs";

const now = new Date("2026-08-25T12:00:00Z").getTime();
const at = iso => [{ run_at: iso }];

// Normal jitter: GitHub often misses a tick or two.
assert.equal(assessRunFreshness(at("2026-08-25T11:40:00Z"), { now }).healthy, true, "20 minutes is healthy");
assert.equal(assessRunFreshness(at("2026-08-25T10:00:00Z"), { now }).healthy, true, "2 hours is still within tolerance");

// The real blackouts from data/runs.json must all be caught.
const blackouts = [
  ["2026-08-25T09:00:00Z", "3 hours"],
  ["2026-08-24T19:00:00Z", "17 hours"],
  ["2026-08-23T10:00:00Z", "42 hours"],
  ["2026-08-23T06:00:00Z", "50 hours"]
];
for (const [iso, label] of blackouts) {
  const s = assessRunFreshness(at(iso), { now });
  assert.equal(s.healthy, false, `${label} of silence must alert`);
  assert.equal(s.reason, "STALE");
}

// Degenerate inputs must alert rather than silently pass.
assert.equal(assessRunFreshness([], { now }).healthy, false, "no runs at all must alert");
assert.equal(assessRunFreshness([], { now }).reason, "NO_RUNS");
assert.equal(assessRunFreshness(null, { now }).healthy, false, "null runs must alert");
assert.equal(assessRunFreshness(at("not-a-date"), { now }).healthy, false, "an unreadable timestamp must alert");
assert.equal(assessRunFreshness(at("not-a-date"), { now }).reason, "UNREADABLE_TIMESTAMP");

// Threshold is configurable and honoured.
assert.equal(assessRunFreshness(at("2026-08-25T11:00:00Z"), { now, maxAgeMinutes: 30 }).healthy, false, "a tighter threshold must be respected");
assert.equal(assessRunFreshness(at("2026-08-25T11:00:00Z"), { now, maxAgeMinutes: 120 }).healthy, true, "a looser threshold must be respected");

// The alert must carry actionable content.
const payload = buildWatchdogPayload(assessRunFreshness(at("2026-08-23T06:00:00Z"), { now }), "topic");
assert.equal(payload.topic, "topic");
assert.ok(payload.priority >= 4, "a silent monitor is high priority");
assert.ok(/hours/.test(payload.message), "the alert must say how long it has been silent");
assert.ok(payload.actions?.[0]?.url?.includes("actions/workflows"), "the alert must link to the workflow so a run can be started");

console.log("Watchdog blackout-detection tests passed.");
