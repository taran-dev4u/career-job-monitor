// Free instant phone alerts via ntfy.sh — replaces the GitHub-issue emails.
//
// Reads data/last_batch.json (the newest scan's new jobs + health alerts) and
// pushes one notification per new eligible job to your private ntfy topic.
// Install the "ntfy" app, subscribe to your topic, and jobs arrive instantly.
//
// Config comes from env (set as GitHub Actions secrets so it stays private even
// in a public repo):
//   NTFY_TOPIC   required — your secret topic name
//   NTFY_SERVER  optional — defaults to https://ntfy.sh
//
// Non-fatal by design: any failure here never breaks a scan.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOPIC = process.env.NTFY_TOPIC;
const SERVER = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const MAX_PER_RUN = 12;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

async function push({ title, message, click, tags, priority }) {
  const headers = { Title: title, Tags: tags || "briefcase", Priority: String(priority || 3) };
  if (click) headers.Click = click;
  const res = await fetch(`${SERVER}/${encodeURIComponent(TOPIC)}`, { method: "POST", headers, body: message });
  if (!res.ok) throw new Error(`ntfy ${res.status} ${res.statusText}`);
}

async function main() {
  if (!TOPIC) { console.log("NTFY_TOPIC not set — skipping ntfy notifications."); return; }
  const batch = await readJson(path.join(ROOT, "data", "last_batch.json"), {});
  const jobs = Array.isArray(batch.jobs) ? batch.jobs : [];
  const alerts = Array.isArray(batch.health_alerts) ? batch.health_alerts : [];

  if (!jobs.length && !alerts.length) { console.log("No new jobs or health alerts to push."); return; }

  const send = jobs.slice(0, MAX_PER_RUN);
  let ok = 0;
  for (const j of send) {
    const role = j.role || j.title || "New role";
    const company = j.company || "";
    const loc = j.location && !/search for jobs/i.test(j.location) ? j.location : "US";
    const spons = j.sponsorship_status ? ` · sponsorship: ${j.sponsorship_status}` : "";
    try {
      await push({
        title: `${role} — ${company}`,
        message: `${loc}${spons}\nTap to apply.`,
        click: j.job_url,
        tags: "briefcase",
        priority: 4
      });
      ok++;
    } catch (e) { console.error(`ntfy job push failed: ${e.message}`); }
  }
  if (jobs.length > send.length) {
    try { await push({ title: `+${jobs.length - send.length} more new jobs`, message: "Open the dashboard for the full list.", tags: "sparkles", priority: 3 }); } catch {}
  }
  if (alerts.length) {
    const names = [...new Set(alerts.map(a => a.company))].join(", ");
    try { await push({ title: `⚠ ${alerts.length} source(s) need attention`, message: names, tags: "warning", priority: 2 }); } catch {}
  }
  console.log(`ntfy: pushed ${ok}/${send.length} job notifications${alerts.length ? ` + ${alerts.length} health alert(s)` : ""}.`);
}

main().catch(e => { console.error(`ntfy notifier warning: ${e.stack || e.message}`); });
