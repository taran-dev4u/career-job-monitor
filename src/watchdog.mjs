// Scheduler watchdog.
//
// GitHub's `schedule:` trigger is best-effort. This repo's own run history shows
// it silently stopping for long stretches:
//
//   2026-08-19 15:54 -> 2026-08-20 08:56   17 h dark
//   2026-08-20 08:56 -> 2026-08-22 10:45   49 h dark
//   2026-08-22 16:56 -> 2026-08-24 10:55   42 h dark
//
// Every run that did fire succeeded. Nothing failed, nothing alerted - the feed
// just went quiet, which is indistinguishable from "no new jobs today". For a
// job search that is the worst possible failure, because it looks like success.
//
// This module answers one question: when did we last actually scan, and is that
// too long ago? Run it from anywhere with network access (a second workflow, a
// cron-job.org ping, or by hand) and it pushes an alert when the monitor has
// gone silent.
//
// Usage:
//   node src/watchdog.mjs                  # check, alert if silent
//   node src/watchdog.mjs --max-age 180    # custom threshold, minutes
//   node src/watchdog.mjs --json           # machine-readable, no push

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pushNtfy } from "./notify_ntfy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Two missed 30-minute ticks is normal jitter; 2.5 hours of silence is not.
const DEFAULT_MAX_AGE_MINUTES = 150;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

export function assessRunFreshness(runs, { now = Date.now(), maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES } = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return { healthy: false, reason: "NO_RUNS", minutesSinceLastRun: null, lastRunAt: null, maxAgeMinutes };
  }
  const last = runs[runs.length - 1];
  const lastRunAt = last?.run_at || null;
  const t = lastRunAt ? new Date(lastRunAt).getTime() : NaN;
  if (Number.isNaN(t)) {
    return { healthy: false, reason: "UNREADABLE_TIMESTAMP", minutesSinceLastRun: null, lastRunAt, maxAgeMinutes };
  }
  const minutes = Math.round((now - t) / 60000);
  return {
    healthy: minutes <= maxAgeMinutes,
    reason: minutes <= maxAgeMinutes ? "OK" : "STALE",
    minutesSinceLastRun: minutes,
    lastRunAt,
    maxAgeMinutes
  };
}

export function buildWatchdogPayload(status, topic) {
  const hours = status.minutesSinceLastRun === null ? "?" : (status.minutesSinceLastRun / 60).toFixed(1);
  const lines = [
    `The job monitor has not completed a scan in **${hours} hours**.`,
    "",
    `Last successful run: ${status.lastRunAt || "never recorded"}`,
    `Alert threshold: ${status.maxAgeMinutes} minutes`,
    "",
    `GitHub's scheduled trigger is best-effort and has stopped for 40+ hours before without failing anything.`,
    `Start a run manually from the Actions tab to resume coverage.`
  ];
  return {
    topic,
    title: "⏰ Job monitor has gone quiet",
    message: lines.join("\n"),
    markdown: true,
    tags: ["alarm_clock", "warning"],
    priority: 5,
    actions: [{
      action: "view",
      label: "▶ Run it now",
      url: "https://github.com/taran-dev4u/career-job-monitor/actions/workflows/job-monitor.yml"
    }]
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const idx = args.indexOf("--max-age");
  const maxAgeMinutes = idx >= 0 ? Number(args[idx + 1]) : DEFAULT_MAX_AGE_MINUTES;

  const runs = await readJson(path.join(ROOT, "data", "runs.json"), []);
  const status = assessRunFreshness(runs, { maxAgeMinutes });

  if (jsonOnly) { console.log(JSON.stringify(status, null, 2)); return; }

  if (status.healthy) {
    console.log(`Watchdog OK: last run ${status.minutesSinceLastRun} min ago (threshold ${maxAgeMinutes}).`);
    return;
  }

  console.error(`Watchdog ALERT: ${status.reason}; last run ${status.minutesSinceLastRun ?? "?"} min ago.`);
  const config = await readJson(path.join(ROOT, "config.json"), {});
  const topic = process.env.NTFY_TOPIC || config.ntfy_topic || "";
  if (!topic) { console.error("No NTFY_TOPIC configured; cannot send the watchdog alert."); return; }
  const server = (process.env.NTFY_SERVER || config.ntfy_server || "https://ntfy.sh").replace(/\/$/, "");
  try {
    await pushNtfy(server, buildWatchdogPayload(status, topic), process.env.NTFY_TOKEN || config.ntfy_token || "");
    console.log("Watchdog alert pushed.");
  } catch (e) {
    console.error(`Watchdog push failed: ${e.message}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => console.error(`Watchdog warning: ${e.stack || e.message}`));
}
