import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newestFirst } from "./job_order.mjs";
import { readJson } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const escapeMd = value => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const displayYears = value => value === null || value === undefined ? "Not stated" : `${value}+ years`;
const reasons = job => Array.isArray(job.exclusion_reasons) && job.exclusion_reasons.length ? job.exclusion_reasons.join("; ") : "—";

function dashboardHeader(title, runAt) {
  const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(runAt));
  return [
    `# ${title}`, "", `Updated: **${runAt} UTC** / **${eastern} Eastern**`, "",
    `[Filtered eligible jobs](LATEST_JOBS.md) · [All extracted jobs](ALL_EXTRACTED_JOBS.md) · [Download Excel workbook](outputs/job-monitor/Job_Monitor.xlsx) · [Workflow runs](https://github.com/taran-dev4u/career-job-monitor/actions/workflows/job-monitor.yml)`, "",
    "> Newest discovered jobs are always shown first.", ""
  ];
}

export function filteredDashboard(runAt, records, health) {
  const active = newestFirst(records.filter(record => record.accepted && record.active_status === "Active"));
  const counts = health.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
  const lines = dashboardHeader("Latest Eligible Jobs — Filtered", runAt);
  lines.push(`Source health: **${counts.Healthy || 0} healthy**, **${counts["Confirmed Empty"] || 0} confirmed empty**, **${counts.Degraded || 0} degraded**, **${counts.Broken || 0} broken**.`, "", "## Apply Now", "");
  if (!active.length) lines.push("No currently verified eligible jobs are available.", "");
  else {
    lines.push("| First Seen | Company | Role | Location | Type | Posted | Required | Preferred | Sponsorship | Apply |", "|---|---|---|---|---|---|---:|---:|---|---|");
    for (const job of active) lines.push(`| ${escapeMd(job.first_seen_at || job.discovered_at || "Not stated")} | ${escapeMd(job.company)} | ${escapeMd(job.title || job.role)} | ${escapeMd(job.location || "Not stated")} | ${escapeMd(job.job_type || "Not specified")} | ${escapeMd(job.posted || "Not stated")} | ${displayYears(job.required_experience_years)} | ${displayYears(job.preferred_experience_years)} | ${escapeMd(job.sponsorship_status || "Not Mentioned")} | [Apply](${job.job_url}) |`);
    lines.push("");
  }
  lines.push("## Source Health", "", "| ID | Company | Status | Candidates | Details Failed | Zero Streak | Last Healthy | Diagnostic |", "|---|---|---|---:|---:|---:|---|---|");
  for (const item of health) lines.push(`| ${item.company_id} | ${escapeMd(item.company)} | ${item.status} | ${item.candidate_count} | ${item.detail_error_count} | ${item.zero_streak} | ${escapeMd(item.last_healthy_at || "Never")} | ${escapeMd(item.diagnostic || "")} |`);
  lines.push("", "> “Degraded” means extraction could not prove the source was complete. Review the unfiltered dashboard or workbook audit sheets for every decision.", "");
  return `${lines.join("\n").trimEnd()}\n`;
}

export function unfilteredDashboard(runAt, records) {
  const ordered = newestFirst(records);
  const counts = ordered.reduce((acc, item) => { const key = item.decision || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const lines = dashboardHeader("All Extracted Jobs — Unfiltered", runAt);
  lines.push(`Snapshot totals: **${ordered.length} extracted**, **${counts.Included || 0} included**, **${counts.Rejected || 0} rejected**, **${counts["Pending Detail"] || 0} pending**, **${counts["Extraction Error"] || 0} extraction errors**.`, "", "This view intentionally includes rejected jobs. Use the **Decision** and **Reasons** columns before applying.", "", "## Every Extracted Job", "");
  if (!ordered.length) lines.push("No jobs have been extracted yet.", "");
  else {
    lines.push("| First Seen | Company | Role | Location | Posted | Sponsorship | Required | Decision | Reasons | Apply |", "|---|---|---|---|---|---|---:|---|---|---|");
    for (const job of ordered) lines.push(`| ${escapeMd(job.first_seen_at || job.discovered_at || "Not stated")} | ${escapeMd(job.company)} | ${escapeMd(job.title || job.role)} | ${escapeMd(job.location || "Not stated")} | ${escapeMd(job.posted || "Not stated")} | ${escapeMd(job.sponsorship_status || "Unclear")} | ${displayYears(job.required_experience_years)} | ${escapeMd(job.decision || "Unknown")} | ${escapeMd(reasons(job))} | [Open](${job.job_url}) |`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function writeDashboards(root, runAt, records, health) {
  await Promise.all([
    fs.writeFile(path.join(root, "LATEST_JOBS.md"), filteredDashboard(runAt, records, health), "utf8"),
    fs.writeFile(path.join(root, "ALL_EXTRACTED_JOBS.md"), unfilteredDashboard(runAt, records), "utf8")
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const records = await readJson(path.join(ROOT, "data", "current_candidates.json"), []);
  const health = await readJson(path.join(ROOT, "data", "source_health.json"), []);
  const runs = await readJson(path.join(ROOT, "data", "runs.json"), []);
  const runAt = runs.at(-1)?.run_at || new Date().toISOString();
  await writeDashboards(ROOT, runAt, records, health);
  console.log(`Updated LATEST_JOBS.md and ALL_EXTRACTED_JOBS.md with ${records.length} newest-first records.`);
}
