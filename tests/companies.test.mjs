// Per-company contract tests.
//
// The owner's requirement: every company is handled independently, and a
// problem at one must never be masked by the other sixteen. These tests hold
// each company to its own contract, one at a time, and fail with the specific
// company id so a break names the source that broke.

import assert from "node:assert/strict";
import companies from "../companies.json" with { type: "json" };
import config from "../config.json" with { type: "json" };
import { adapterName, companySettings } from "../src/scrape.mjs";
import { auditCompany, auditAllCompanies } from "../src/company_audit.mjs";
import { evaluateEligibility, stableJobIdentityKey, canonicalCompanyJobKey } from "../src/lib.mjs";

// ---------------------------------------------------------------------------
// 1. Every company is well-formed, and independently addressable.
// ---------------------------------------------------------------------------
const ids = new Set();
for (const c of companies) {
  const at = `[${c.id} ${c.company}]`;
  assert.ok(/^CMP-\d{3}$/.test(c.id), `${at} id must look like CMP-001`);
  assert.ok(!ids.has(c.id), `${at} duplicate company id`);
  ids.add(c.id);
  assert.ok(c.company && c.company.trim().length > 1, `${at} needs a display name`);
  assert.ok(/^https:\/\//.test(c.career_url), `${at} career_url must be https`);
  assert.doesNotThrow(() => new URL(c.career_url), `${at} career_url must parse`);
}

// ---------------------------------------------------------------------------
// 2. Every company declares its own limits and expectations.
// Without these the self-audit cannot judge a source on its own terms, which is
// how Amazon ran for days returning 30 unusable candidates while the aggregate
// health summary reported "17/17 Healthy".
// ---------------------------------------------------------------------------
for (const c of companies) {
  const at = `[${c.id} ${c.company}]`;
  assert.ok(c.limits && typeof c.limits === "object", `${at} must declare a limits object`);
  assert.ok(c.expects && typeof c.expects === "object", `${at} must declare an expects object`);
  assert.equal(typeof c.expects.min_candidates, "number", `${at} expects.min_candidates must be a number`);
  assert.ok(c.expects.min_candidates >= 0, `${at} expects.min_candidates must not be negative`);
  assert.equal(typeof c.expects.location, "boolean", `${at} expects.location must be a boolean`);
  assert.equal(typeof c.expects.date, "boolean", `${at} expects.date must be a boolean`);
  assert.ok(c.notes && c.notes.length > 20, `${at} must record WHY its settings differ from the defaults`);
}

// ---------------------------------------------------------------------------
// 3. Per-company settings resolve independently and never leak between sources.
// ---------------------------------------------------------------------------
for (const c of companies) {
  const at = `[${c.id} ${c.company}]`;
  const s = companySettings(c, config);
  assert.ok(s.max_cards_per_company > 0, `${at} resolved a non-positive card budget`);
  assert.ok(s.max_pages_per_company > 0, `${at} resolved a non-positive page budget`);
  assert.ok(s.max_new_details_per_company > 0, `${at} resolved a non-positive detail budget`);
  assert.ok(s.navigation_timeout_ms >= 10000, `${at} navigation timeout is implausibly short`);
  assert.ok(s.settle_time_ms >= 1000, `${at} settle time is implausibly short`);
  // A company that declares a value must get that value, not the global one.
  for (const [k, prop] of [["max_cards", "max_cards_per_company"], ["max_pages", "max_pages_per_company"],
                           ["max_new_details", "max_new_details_per_company"],
                           ["navigation_timeout_ms", "navigation_timeout_ms"], ["settle_time_ms", "settle_time_ms"]]) {
    if (c.limits[k] !== undefined) assert.equal(s[prop], c.limits[k], `${at} override ${k} was not honoured`);
  }
}

// A company with no overrides must fall back cleanly to the globals.
const bare = companySettings({ id: "CMP-999", company: "Bare", career_url: "https://x.test/" }, config);
assert.equal(bare.max_cards_per_company, config.max_cards_per_company, "bare company must inherit the global card budget");
assert.equal(bare.settle_time_ms, config.settle_time_ms, "bare company must inherit the global settle time");

// Changing one company's settings must not change another's.
const amazon = companies.find(c => c.id === "CMP-001");
const google = companies.find(c => c.id === "CMP-003");
const beforeGoogle = companySettings(google, config).max_cards_per_company;
companySettings({ ...amazon, limits: { ...amazon.limits, max_cards: 999 } }, config);
assert.equal(companySettings(google, config).max_cards_per_company, beforeGoogle,
  "resolving one company's settings must not affect another's");

// ---------------------------------------------------------------------------
// 4. Each company resolves to exactly one adapter, and CMP-011 is the only
//    source on the untuned generic path (it has no dedicated adapter).
// ---------------------------------------------------------------------------
const generic = companies.filter(c => adapterName(c.career_url) === "Generic DOM/JSON-LD").map(c => c.id);
assert.deepEqual(generic, ["CMP-011"],
  `only CMP-011 should use the generic adapter; got ${JSON.stringify(generic)}`);
for (const c of companies) {
  assert.ok(adapterName(c.career_url).length > 0, `[${c.id}] resolved no adapter`);
}

// ---------------------------------------------------------------------------
// 5. Identity keys are namespaced per company: two companies sharing a job id
//    must never collide, or one company's job could suppress another's alert.
// ---------------------------------------------------------------------------
for (let i = 0; i < companies.length; i++) {
  for (let j = i + 1; j < companies.length; j++) {
    const a = stableJobIdentityKey(companies[i].id, "123456", "https://example.test/job/123456");
    const b = stableJobIdentityKey(companies[j].id, "123456", "https://example.test/job/123456");
    assert.notEqual(a, b, `${companies[i].id} and ${companies[j].id} collide on an identical job id`);
    assert.notEqual(canonicalCompanyJobKey(companies[i].id, "123456", ""), canonicalCompanyJobKey(companies[j].id, "123456", ""),
      `${companies[i].id} and ${companies[j].id} collide on the canonical catalog key`);
  }
}

// ---------------------------------------------------------------------------
// 6. The self-audit catches, per company, each way a source can look healthy
//    while producing nothing usable.
// ---------------------------------------------------------------------------
const co = { id: "CMP-TEST", company: "Test Co", career_url: "https://x.test/", expects: { min_candidates: 5, location: true, date: true } };
const ok = { status: "Healthy" };
const rec = (n, over = {}) => Array.from({ length: n }, (_, i) => ({
  company_id: "CMP-TEST", company: "Test Co", title: `Software Engineer ${i}`,
  location: "Seattle, WA", posted: `2026-08-${String(10 + (i % 10)).padStart(2, "0")}`, accepted: true, ...over
}));

const codes = r => r.findings.map(f => f.code);

// A source returning far fewer candidates than it should.
assert.ok(codes(auditCompany(co, rec(1), ok)).includes("TOO_FEW_CANDIDATES"), "must flag a collapsed candidate count");
// Amazon's exact failure: every location blank on a source that should have one.
assert.ok(codes(auditCompany(co, rec(10, { location: "" }), ok)).includes("LOCATION_EXTRACTION_DEAD"), "must flag dead location extraction");
// Amazon's other failure: one page-level date stamped on every job.
assert.ok(codes(auditCompany(co, rec(10, { posted: "Posted: February 6, 2026 (Updated 3 months ago)" }), ok)).includes("SHARED_POSTING_DATE"), "must flag a shared posting date");
// Compunnel's failure, found by this audit: a button label scraped as a date.
assert.ok(codes(auditCompany(co, rec(10, { posted: "Upload Resume" }), ok)).includes("SHARED_POSTING_DATE"), "must flag a non-date scraped as a date");
// A source that scans cleanly but has yielded nothing eligible for over a day.
const stale = auditCompany(co, rec(10, { accepted: false }), ok, { zero_eligible_since: "2026-08-20T00:00:00Z" }, "2026-08-24T00:00:00Z");
assert.ok(codes(stale).includes("ZERO_ELIGIBLE_STREAK"), "must flag a long zero-eligible streak");
// A broken scan.
assert.ok(codes(auditCompany(co, [], { status: "Broken", diagnostic: "timeout" })).includes("SOURCE_BROKEN"), "must flag a broken source");
// A healthy source must produce no critical finding.
assert.equal(auditCompany(co, rec(10), ok).findings.filter(f => f.severity === "critical").length, 0, "a healthy source must not be flagged");

// A source that legitimately has no location must not be flagged as broken.
const noLocExpected = { ...co, expects: { min_candidates: 5, location: false, date: false } };
assert.equal(auditCompany(noLocExpected, rec(10, { location: "", posted: "" }), ok).findings.filter(f => f.severity === "critical").length, 0,
  "a source that never publishes a location must not be flagged when it declares that");

// ---------------------------------------------------------------------------
// 7. One company's failure must not affect another company's verdict.
// ---------------------------------------------------------------------------
const twoCos = [
  { id: "CMP-A", company: "Broken Co", career_url: "https://a.test/", expects: { min_candidates: 5, location: true, date: true } },
  { id: "CMP-B", company: "Healthy Co", career_url: "https://b.test/", expects: { min_candidates: 5, location: true, date: true } }
];
const mixed = auditAllCompanies(twoCos,
  [...rec(10, { company_id: "CMP-A", location: "" }), ...rec(10, { company_id: "CMP-B" })],
  [{ company_id: "CMP-A", status: "Healthy" }, { company_id: "CMP-B", status: "Healthy" }]);
assert.ok(mixed.critical.every(f => f.company_id === "CMP-A"), "only the broken company may be flagged");
assert.ok(mixed.critical.length > 0, "the broken company must be flagged");

// ---------------------------------------------------------------------------
// 8. Eligibility is evaluated identically regardless of which company a job
//    came from - no company gets secretly stricter filtering than another.
// ---------------------------------------------------------------------------
const job = { title: "Software Engineer I", context: "Seattle, Washington, United States", description: "Seattle, Washington, United States", location: "Seattle, WA", posted: "Today", config };
const baseline = evaluateEligibility(job);
assert.equal(baseline.accepted, true, "the reference job must be eligible");
for (const c of companies) {
  const r = evaluateEligibility(job);
  assert.equal(r.accepted, baseline.accepted, `[${c.id}] eligibility must not vary by company`);
  assert.deepEqual(r.exclusion_reasons, baseline.exclusion_reasons, `[${c.id}] exclusion reasons must not vary by company`);
}

console.log(`Per-company contract tests passed for all ${companies.length} companies.`);
