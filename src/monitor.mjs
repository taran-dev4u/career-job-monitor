import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { extractJobId, readJson, stableJobIdentityKey, writeJsonAtomic } from "./lib.mjs";
import { scanCompany, startBrowser, adapterName } from "./scrape.mjs";
import { writeDashboards } from "./dashboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const forceSuppress = args.includes("--suppress-notifications");
const intervalIndex = args.indexOf("--interval-minutes");
const config = await readJson(path.join(ROOT, "config.json"), {});
const companies = await readJson(path.join(ROOT, "companies.json"), []);
const intervalMinutes = intervalIndex >= 0 ? Number(args[intervalIndex + 1]) : Number(config.interval_minutes || 30);

const dataPath = name => path.join(ROOT, "data", name);

async function rebuildWorkbook() {
  const builder = process.env.WORKBOOK_BUILDER || path.join("src", "build_workbook.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(ROOT, builder)], { cwd: ROOT, stdio: "inherit" });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Workbook builder exited ${code}`)));
    child.on("error", reject);
  });
}

function asHistoricalJob(record, discoveredAt) {
  return {
    discovered_at: discoveredAt, company_id: record.company_id, company: record.company, role: record.title,
    location: record.location, experience: record.experience_label, posted: record.posted, job_id: record.job_id,
    job_url: record.job_url, source_url: record.source_url,
    match_reason: `Eligible technical role; ${record.experience_label}; sponsorship: ${record.sponsorship_status}; ${record.student_enrollment}`,
    description_snippet: record.description_snippet, key: record.key, active_status: record.active_status,
    job_type: record.job_type, required_experience_years: record.required_experience_years,
    preferred_experience_years: record.preferred_experience_years, sponsorship_status: record.sponsorship_status,
    sponsorship_evidence: record.sponsorship_evidence, experience_evidence: record.experience_evidence
  };
}

function identityKey(record) {
  const jobId = record.job_id || extractJobId(record.job_url || "", record.title || record.role || "");
  return stableJobIdentityKey(record.company_id, jobId, record.job_url || "");
}

function migrateStateToStableJobIds(state, records) {
  for (const [oldKey, entry] of Object.entries(state.evaluated)) {
    const record = entry?.record;
    if (!record?.company_id || !record?.job_url) continue;
    const jobId = record.job_id || extractJobId(record.job_url, record.title || record.role || "");
    if (!jobId) continue;
    const newKey = stableJobIdentityKey(record.company_id, jobId, record.job_url);
    const migrated = { ...entry, record: { ...record, key: newKey, job_id: jobId } };
    if (!state.evaluated[newKey] || String(entry.last_evaluated_at || "") > String(state.evaluated[newKey].last_evaluated_at || "")) state.evaluated[newKey] = migrated;
    const discovery = state.discovered[oldKey] || { first_seen_at: record.first_seen_at || "", url: record.job_url };
    state.discovered[newKey] ||= { ...discovery, url: record.job_url };
    if (state.notified[oldKey]) state.notified[newKey] ||= { ...state.notified[oldKey], reason: `${state.notified[oldKey].reason || "previous notification"}; migrated to job ID` };
  }
  for (const record of records) {
    if (!record?.company_id || !record?.job_url) continue;
    const jobId = record.job_id || extractJobId(record.job_url, record.title || record.role || "");
    if (!jobId) continue;
    const newKey = stableJobIdentityKey(record.company_id, jobId, record.job_url);
    const oldKey = record.key;
    if (oldKey && state.notified[oldKey]) state.notified[newKey] ||= { ...state.notified[oldKey], reason: `${state.notified[oldKey].reason || "previous notification"}; migrated to job ID` };
  }
}

async function runOnce() {
  const started = Date.now();
  const state = await readJson(dataPath("state.json"), { initialized: false, seen: {} });
  state.discovered ||= { ...(state.seen || {}) };
  state.evaluated ||= {};
  state.notified ||= {};
  const priorSchemaVersion = Number(state.schema_version || 1);
  const jobs = await readJson(dataPath("jobs.json"), []);
  const runs = await readJson(dataPath("runs.json"), []);
  const priorCurrent = await readJson(dataPath("current_candidates.json"), []);
  if (priorSchemaVersion < 3 && state.reliability_baseline_complete) {
    for (const record of priorCurrent.filter(item => item.decision === "Pending Detail")) {
      if (record.key) state.notified[record.key] ||= { notified_at: state.last_run_at || new Date().toISOString(), reason: "baseline pending first evaluation" };
    }
  }
  if (priorSchemaVersion < 4) migrateStateToStableJobIds(state, [...priorCurrent, ...jobs]);
  for (const job of jobs) {
    const key = identityKey(job);
    state.notified[key] ||= { notified_at: job.discovered_at, reason: "accepted history" };
  }
  state.schema_version = 4;
  const priorAudit = await readJson(dataPath("decision_history.json"), []);
  const priorHealth = await readJson(dataPath("source_health.json"), []);
  const healthById = new Map(priorHealth.map(item => [item.company_id, item]));
  const upgradeBaseline = !state.reliability_baseline_complete;
  const configuredBaseline = config.baseline_on_first_run !== false && state.initialized === false;
  const suppressNotifications = forceSuppress || upgradeBaseline || configuredBaseline;
  const current = [], evaluations = [], addedRecords = [], health = [];
  let browser;
  try {
    browser = await startBrowser(config.headless !== false);
    for (const company of companies) {
      const previous = healthById.get(company.id) || {};
      try {
        const result = await scanCompany(browser, company, config, state, suppressNotifications);
        current.push(...result.records);
        evaluations.push(...result.evaluations);
        addedRecords.push(...result.newJobs);
        const zeroStreak = result.candidates === 0 ? Number(previous.zero_streak || 0) + 1 : 0;
        const degradedStreak = result.status === "Degraded" ? Number(previous.degraded_streak || 0) + 1 : 0;
        health.push({
          run_at: new Date().toISOString(), company_id: company.id, company: company.company, source_url: company.career_url,
          resolved_url: result.resolved_url, adapter: result.adapter, http_status: result.http_status, status: result.status,
          candidate_count: result.candidates, detail_success_count: result.records.filter(x => x.description_extracted).length,
          detail_error_count: result.detail_errors, pending_detail_count: result.pending,
          eligible_count: result.records.filter(x => x.accepted).length, rejected_count: result.records.filter(x => x.decision === "Rejected").length,
          zero_streak: zeroStreak, degraded_streak: degradedStreak,
          last_candidate_at: result.candidates ? new Date().toISOString() : previous.last_candidate_at || "",
          last_healthy_at: ["Healthy", "Confirmed Empty"].includes(result.status) ? new Date().toISOString() : previous.last_healthy_at || "",
          diagnostic: result.diagnostic
        });
        console.log(`${company.id} ${company.company}: ${result.status}; ${result.candidates} candidates; ${result.newJobs.length} new eligible`);
      } catch (error) {
        health.push({ run_at: new Date().toISOString(), company_id: company.id, company: company.company, source_url: company.career_url, resolved_url: "", adapter: adapterName(company.career_url), http_status: 0, status: "Broken", candidate_count: 0, detail_success_count: 0, detail_error_count: 0, pending_detail_count: 0, eligible_count: 0, rejected_count: 0, zero_streak: Number(previous.zero_streak || 0) + 1, degraded_streak: 0, last_candidate_at: previous.last_candidate_at || "", last_healthy_at: previous.last_healthy_at || "", diagnostic: error.message });
        console.error(`${company.id} ${company.company}: Broken; ${error.message}`);
      }
      await writeJsonAtomic(dataPath("state.json"), state);
    }
  } finally { if (browser) await browser.close().catch(error => console.error(`Browser shutdown warning: ${error.message}`)); }

  const runAt = new Date().toISOString();
  const uniqueExisting = new Set(jobs.map(identityKey));
  const added = [];
  for (const record of addedRecords) {
    const dedup = identityKey(record);
    if (uniqueExisting.has(dedup)) { state.notified[record.key] ||= { notified_at: runAt, reason: "deduplicated against history" }; continue; }
    uniqueExisting.add(dedup);
    added.push(asHistoricalJob(record, runAt));
    state.notified[record.key] = { notified_at: runAt, reason: "new eligible job" };
  }
  state.initialized = true;
  state.reliability_baseline_complete = true;
  state.last_run_at = runAt;
  await writeJsonAtomic(dataPath("state.json"), state);
  await writeJsonAtomic(dataPath("jobs.json"), [...jobs, ...added]);
  await writeJsonAtomic(dataPath("current_candidates.json"), current);
  const cutoff = Date.now() - Number(config.decision_history_days || 30) * 86_400_000;
  await writeJsonAtomic(dataPath("decision_history.json"), [...priorAudit, ...evaluations].filter(item => new Date(item.evaluated_at || item.last_verified_at).getTime() >= cutoff));
  await writeJsonAtomic(dataPath("source_health.json"), health);
  await writeJsonAtomic(dataPath("last_batch.json"), { run_at: runAt, suppressed: suppressNotifications, jobs: added, health_alerts: health.filter(item => item.status === "Broken" || (item.status === "Degraded" && item.degraded_streak >= Number(config.source_health_degraded_alert_streak || 3))) });
  const counts = health.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
  runs.push({ run_at: runAt, mode: upgradeBaseline ? "reliability baseline" : configuredBaseline ? "configured baseline" : "incremental", companies_checked: companies.length, candidates_seen: current.length, evaluations_completed: evaluations.length, new_jobs_added: added.length, healthy_sources: counts.Healthy || 0, confirmed_empty_sources: counts["Confirmed Empty"] || 0, degraded_sources: counts.Degraded || 0, broken_sources: counts.Broken || 0, errors: counts.Broken || 0, duration_seconds: Math.round((Date.now() - started) / 100) / 10 });
  await writeJsonAtomic(dataPath("runs.json"), runs.slice(-500));
  await writeDashboards(ROOT, runAt, current, health);
  await rebuildWorkbook();
  console.log(`Completed: ${added.length} new jobs; ${counts.Healthy || 0} healthy, ${counts["Confirmed Empty"] || 0} confirmed empty, ${counts.Degraded || 0} degraded, ${counts.Broken || 0} broken.`);
}

do {
  try { await runOnce(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
  if (!watch) break;
  console.log(`Next run in ${intervalMinutes} minutes.`);
  await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60_000));
} while (true);
