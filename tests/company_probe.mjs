// Single-company live probe.
//
// Scans ONE company against the real website and prints exactly what came back,
// field by field, with the eligibility verdict and reason for every candidate.
// Nothing is written: no state, no data files, no notifications. Safe to run at
// any time, including while the scheduled workflow is running.
//
// This exists because the cloud runner cannot reach these sites and the GitHub
// datacenter IP is bot-blocked by some of them (higher.gs.com in particular),
// so the only way to see the truth for one source is to run it from a normal
// residential connection.
//
// Usage:
//   node tests/company_probe.mjs CMP-001
//   node tests/company_probe.mjs CMP-001 --verbose     # full rejection reasons
//   node tests/company_probe.mjs --all                 # every company, slow

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../src/lib.mjs";
import { scanCompany, startBrowser, adapterName, companySettings } from "../src/scrape.mjs";
import { auditCompany, formatAuditReport } from "../src/company_audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const all = args.includes("--all");
const wanted = args.filter(a => /^CMP-\d{3}$/i.test(a)).map(a => a.toUpperCase());

const config = await readJson(path.join(ROOT, "config.json"), {});
const companies = await readJson(path.join(ROOT, "companies.json"), []);

if (!all && !wanted.length) {
  console.error("Usage: node tests/company_probe.mjs CMP-001 [--verbose]");
  console.error("       node tests/company_probe.mjs --all\n");
  console.error("Available companies:");
  for (const c of companies) console.error(`  ${c.id}  ${c.company}`);
  process.exit(1);
}

const targets = all ? companies : companies.filter(c => wanted.includes(c.id));
if (!targets.length) { console.error(`No company matched ${wanted.join(", ")}`); process.exit(1); }

const bar = "-".repeat(78);
const browser = await startBrowser(config.headless !== false);
let anyCritical = false;

try {
  for (const company of targets) {
    const settings = companySettings(company, config);
    console.log(`\n${bar}\n${company.id}  ${company.company}\n${bar}`);
    console.log(`URL      : ${company.career_url}`);
    console.log(`Adapter  : ${adapterName(company.career_url)}`);
    console.log(`Limits   : ${settings.max_cards_per_company} cards / ${settings.max_pages_per_company} pages / ${settings.max_new_details_per_company} details, settle ${settings.settle_time_ms}ms, nav ${settings.navigation_timeout_ms}ms`);
    console.log(`Expects  : >=${company.expects?.min_candidates ?? "?"} candidates, location=${company.expects?.location}, date=${company.expects?.date}`);
    if (company.notes) console.log(`Notes    : ${company.notes}`);

    // A throwaway state object: this probe must never mutate real state.
    const scratch = { discovered: {}, evaluated: {}, notified: {} };
    const started = Date.now();
    let result;
    try {
      // suppressNotifications = true: a probe must never trigger an alert.
      result = await scanCompany(browser, company, config, scratch, true);
    } catch (error) {
      console.log(`\n  SCAN FAILED: ${error.message}`);
      anyCritical = true;
      continue;
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const records = result.records;
    const eligible = records.filter(r => r.accepted);
    const withLoc = records.filter(r => r.location).length;
    const withDate = records.filter(r => r.posted).length;
    const dates = new Set(records.filter(r => r.posted).map(r => r.posted));

    console.log(`\nRESULT   : ${result.status} in ${seconds}s, HTTP ${result.http_status}`);
    console.log(`Candidates: ${result.candidates}   Records: ${records.length}   Eligible: ${eligible.length}`);
    console.log(`Location present: ${withLoc}/${records.length}   Posting date present: ${withDate}/${records.length}   Distinct dates: ${dates.size}`);
    if (result.diagnostic) console.log(`Diagnostic: ${result.diagnostic}`);

    if (eligible.length) {
      console.log(`\nELIGIBLE (${eligible.length}):`);
      for (const r of eligible) {
        console.log(`  + ${(r.posted || "no date").slice(0, 22).padEnd(23)} ${(r.location || "no location").slice(0, 24).padEnd(25)} ${r.title.slice(0, 52)}`);
        if (verbose) console.log(`      ${r.job_url}`);
      }
    } else {
      console.log("\nELIGIBLE : none");
    }

    const rejected = records.filter(r => r.decision === "Rejected");
    if (rejected.length) {
      const tally = {};
      for (const r of rejected) for (const reason of new Set((r.exclusion_reasons || []).map(x => String(x).replace(/\d+(\.\d+)?/g, "N")))) tally[reason] = (tally[reason] || 0) + 1;
      console.log(`\nREJECTED (${rejected.length}) by reason:`);
      for (const [reason, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${reason}`);
      if (verbose) {
        console.log("\n  every rejected title:");
        for (const r of rejected) console.log(`    - ${r.title.slice(0, 60).padEnd(61)} ${(r.exclusion_reasons || []).join(" | ").slice(0, 70)}`);
      }
    }

    const audit = auditCompany(company, records, { status: result.status, diagnostic: result.diagnostic });
    console.log("");
    console.log(formatAuditReport({ ...audit, critical: audit.findings.filter(f => f.severity === "critical"), warnings: audit.findings.filter(f => f.severity === "warning") }));
    if (audit.findings.some(f => f.severity === "critical")) anyCritical = true;
  }
} finally {
  await browser.close().catch(() => {});
}

console.log(`\n${bar}`);
console.log(anyCritical ? "At least one company failed its own contract (see CRITICAL above)." : "All probed companies met their declared expectations.");
process.exit(anyCritical ? 1 : 0);
