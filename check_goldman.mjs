// Standalone Goldman Sachs checker — run on YOUR machine (residential IP).
//
// Goldman's higher.gs.com returns zero results to GitHub Actions' data-center
// IP, so the cloud monitor can't see it. This script scrapes + filters Goldman
// from your own connection and writes an eligible-jobs list. It shares NO state
// with the main monitor and never touches git, so it is safe to run anytime.
//
//   node check_goldman.mjs
//
// Optional: schedule it locally (Windows Task Scheduler) to run a few times a day.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import companies from "./companies.json" with { type: "json" };
import config from "./config.json" with { type: "json" };
import { scanCompany, startBrowser } from "./src/scrape.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const company = companies.find(c => c.id === "CMP-017");
if (!company) { console.error("CMP-017 (Goldman Sachs) not found in companies.json"); process.exit(1); }

// Give Goldman a little more room than the default, since its SPA loads results
// through a GraphQL call after the page paints.
const cfg = { ...config, max_cards_per_company: 40, max_new_details_per_company: 25, settle_time_ms: 7000 };

console.log("Scanning Goldman Sachs from this machine's IP…");
const browser = await startBrowser(cfg.headless !== false);
try {
  const state = { discovered: {}, evaluated: {}, notified: {} };
  const result = await scanCompany(browser, company, cfg, state, true);
  const records = result.records || [];
  const eligible = records.filter(r => r.accepted && r.active_status === "Active");
  const rejected = records.filter(r => r.decision === "Rejected");

  console.log(`\nStatus: ${result.status} · candidates: ${result.candidates} · eligible: ${eligible.length} · rejected: ${rejected.length}`);
  if (result.candidates === 0) {
    console.log("\n⚠ Zero candidates even from your IP — Goldman may be temporarily blocking or the page was slow. Try again in a minute.");
  }

  const now = new Date();
  const stamp = now.toISOString();
  const lines = [
    "# Goldman Sachs — Eligible Jobs (local check)", "",
    `Checked: ${stamp} · your machine · ${eligible.length} eligible of ${result.candidates} found`, "",
    eligible.length ? "| Role | Location | Type | Req yrs | Sponsorship | Apply |" : "_No currently-eligible Goldman roles matched your filters._",
    eligible.length ? "|---|---|---|---:|---|---|" : ""
  ].filter(Boolean);
  for (const j of eligible) {
    lines.push(`| ${(j.title||"").replace(/\|/g,"\\|")} | ${(j.location||"—").replace(/\|/g,"\\|")} | ${j.job_type||"—"} | ${j.required_experience_years==null?"—":j.required_experience_years+"+"} | ${j.sponsorship_status||"—"} | ${j.job_url} |`);
  }
  const out = path.join(ROOT, "outputs", "job-monitor", "goldman_latest.md");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, lines.join("\n") + "\n", "utf8");

  console.log(`\nEligible Goldman roles (${eligible.length}):`);
  for (const j of eligible) console.log(`  • ${j.title}  [${j.location||"US"}]  ${j.job_url}`);
  console.log(`\nWrote: ${out}`);
} finally {
  await browser.close().catch(()=>{});
}
