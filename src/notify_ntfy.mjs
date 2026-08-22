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
const MAX_PER_RUN = 20;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

// IMPORTANT: publish via ntfy's JSON endpoint, not the header-based shorthand
// (POST body + Title/Tags/Priority/Click headers). HTTP headers must be
// ISO-8859-1/ByteString — Node's fetch() throws a TypeError the instant a
// header value contains a character outside that range. Every job title here
// includes an emoji ("🆕 ..."), and the health-alert title includes "⚠", so
// with the header-based approach EVERY push threw before ever reaching the
// network. The surrounding try/catch swallowed the error and just logged it,
// so the workflow still showed green and nothing ever arrived on the phone.
// The JSON body has no such restriction and is ntfy's documented way to send
// full UTF-8 titles/messages. See https://docs.ntfy.sh/publish/#publish-as-json
async function push({ title, message, click, tags, priority }) {
  const payload = { topic: TOPIC, title, message };
  if (click) payload.click = click;
  if (tags) payload.tags = Array.isArray(tags) ? tags : [tags];
  if (priority) payload.priority = priority;
  const res = await fetch(SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`ntfy ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  if (!TOPIC) { console.log("NTFY_TOPIC not set — skipping ntfy notifications."); return; }
  const batch = await readJson(path.join(ROOT, "data", "last_batch.json"), {});
  const jobs = Array.isArray(batch.jobs) ? batch.jobs : [];
  const alerts = Array.isArray(batch.health_alerts) ? batch.health_alerts : [];

  if (!jobs.length && !alerts.length) { console.log("No new jobs or health alerts to push."); return; }

  const label = j => `${j.role || j.title || "New role"} — ${j.company || ""}`.trim();
  const send = jobs.slice(0, MAX_PER_RUN);
  let ok = 0;
  for (const j of send) {
    const role = j.role || j.title || "New role";
    const company = j.company || "Unknown company";
    const loc = j.location && !/search for jobs/i.test(j.location) ? j.location : "US";
    const spons = j.sponsorship_status ? ` · ${j.sponsorship_status}` : "";
    const posted = j.posted && !/not stated/i.test(j.posted) ? ` · ${j.posted}` : "";
    try {
      await push({
        // Title carries company + role so the alert is meaningful on its own.
        title: `🆕 ${role} · ${company}`,
        message: `${company}\n${loc}${spons}${posted}\nTap to apply →`,
        click: j.job_url,
        tags: "briefcase",
        priority: 4
      });
      ok++;
    } catch (e) { console.error(`ntfy job push failed: ${e.message}`); }
  }
  if (jobs.length > send.length) {
    // Even the overflow names the roles/companies, never a bare count.
    const extra = jobs.slice(MAX_PER_RUN).map(label).join("\n");
    try { await push({ title: `+${jobs.length - send.length} more new jobs`, message: extra, tags: "sparkles", priority: 3 }); } catch {}
  }
  if (alerts.length) {
    const names = [...new Set(alerts.map(a => a.company))].join(", ");
    try { await push({ title: `⚠ ${alerts.length} source(s) need attention`, message: names, tags: "warning", priority: 2 }); } catch {}
  }
  console.log(`ntfy: pushed ${ok}/${send.length} job notifications${alerts.length ? ` + ${alerts.length} health alert(s)` : ""}.`);
}

main().catch(e => { console.error(`ntfy notifier warning: ${e.stack || e.message}`); });
