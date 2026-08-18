import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readJson, writeJsonAtomic } from "./lib.mjs";
import { scanCompany, startBrowser } from "./scrape.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const intervalIndex = args.indexOf("--interval-minutes");
const config = await readJson(path.join(ROOT, "config.json"), {});
const companies = await readJson(path.join(ROOT, "companies.json"), []);
const intervalMinutes = intervalIndex >= 0 ? Number(args[intervalIndex + 1]) : Number(config.interval_minutes || 30);

async function rebuildWorkbook() {
  const builder = process.env.WORKBOOK_BUILDER || path.join("src", "build_workbook.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(ROOT, builder)], { cwd: ROOT, stdio: "inherit" });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Workbook builder exited ${code}`)));
    child.on("error", reject);
  });
}

async function runOnce() {
  const started = Date.now();
  const statePath = path.join(ROOT, "data", "state.json");
  const jobsPath = path.join(ROOT, "data", "jobs.json");
  const runsPath = path.join(ROOT, "data", "runs.json");
  const state = await readJson(statePath, { initialized: false, seen: {} });
  const jobs = await readJson(jobsPath, []);
  const runs = await readJson(runsPath, []);
  const baselineOnly = Boolean(config.baseline_on_first_run && !state.initialized);
  let browser;
  let candidatesSeen = 0;
  let errors = 0;
  const added = [];
  try {
    browser = await startBrowser(config.headless !== false);
    for (const company of companies) {
      try {
        const result = await scanCompany(browser, company, config, state.seen, baselineOnly);
        candidatesSeen += result.candidates;
        added.push(...result.jobs);
        console.log(`${company.id} ${company.company}: ${result.candidates} candidates, ${result.jobs.length} new matches`);
      } catch (error) {
        errors += 1;
        console.error(`${company.id} ${company.company}: ${error.message}`);
      }
      await writeJsonAtomic(statePath, state);
    }
  } finally {
    if (browser) await browser.close().catch(error => console.error(`Browser shutdown warning: ${error.message}`));
  }

  state.initialized = true;
  state.last_run_at = new Date().toISOString();
  await writeJsonAtomic(statePath, state);
  if (added.length) await writeJsonAtomic(jobsPath, [...jobs, ...added]);
  runs.push({
    run_at: new Date().toISOString(),
    mode: baselineOnly ? "baseline" : "incremental",
    companies_checked: companies.length,
    candidates_seen: candidatesSeen,
    new_jobs_added: added.length,
    errors,
    duration_seconds: Math.round((Date.now() - started) / 100) / 10
  });
  await writeJsonAtomic(runsPath, runs.slice(-500));
  await rebuildWorkbook();
  console.log(`Completed: ${added.length} new jobs, ${errors} source errors.`);
}

do {
  try { await runOnce(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
  if (!watch) break;
  console.log(`Next run in ${intervalMinutes} minutes.`);
  await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60_000));
} while (true);
