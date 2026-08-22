// Instant phone/desktop push alerts via ntfy (https://ntfy.sh).
//
// Reads data/last_batch.json (the newest scan's new jobs + health alerts) and
// publishes notifications with actionable links to your private ntfy topic.
//
// Configuration priority:
//   1. Environment variables (NTFY_TOPIC, NTFY_SERVER, NTFY_TOKEN / NTFY_AUTH)
//   2. config.json (ntfy_topic, ntfy_server, ntfy_token)
//
// Non-fatal by design: any push failure is logged and never breaks a scan.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clean, formatReleaseTimeline } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_PER_RUN = 20;

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

export function buildJobPayload(job, topic) {
  const role = job.role || job.title || "New role";
  const company = job.company || "Unknown company";
  const companyId = job.company_id ? ` (${job.company_id})` : "";
  const loc = job.location && !/search for jobs/i.test(job.location) ? job.location : "United States (or Remote)";
  const type = job.job_type && job.job_type !== "Not specified" ? job.job_type : "Full-time";
  const reqId = job.job_id ? job.job_id : "N/A";
  const spons = job.sponsorship_status || "Not Mentioned";
  const exp = job.required_experience_years !== null && job.required_experience_years !== undefined
    ? `${job.required_experience_years} yr(s) required`
    : job.experience && !/no required/i.test(job.experience)
      ? job.experience
      : "0–3 yrs (Eligible)";
  const jobUrl = job.job_url || "";

  const timeline = formatReleaseTimeline(
    job.posted,
    job.discovered_at,
    job.discovery_window_start || job.scan_window?.start
  );

  // Clean description snippet up to 280 chars
  let snippet = (job.description_snippet || "").replace(/\s+/g, " ").trim();
  if (snippet.length > 280) snippet = `${snippet.slice(0, 277)}…`;

  const lines = [
    `🏢 **Company:** ${company}${companyId}`,
    `📍 **Location:** ${loc}`,
    `💼 **Type:** ${type}  |  🆔 **Job ID:** \`${reqId}\``,
    `⏱️ **Experience:** ${exp}`,
    `🛂 **Sponsorship:** ${spons}`,
    `📅 **Released:** ${timeline.posted_display}`,
    `⚡ **Discovery Window:** ${job.discovery_window || timeline.discovery_window}`
  ];

  if (snippet) {
    lines.push("", `📝 **Overview:**`, `> ${snippet}`);
  }

  if (jobUrl) {
    lines.push("", `🔗 **Apply URL:** ${jobUrl}`);
  }

  const payload = {
    topic,
    title: `🎯 New Job: ${role} · ${company}`,
    message: lines.join("\n"),
    markdown: true,
    tags: ["briefcase", "sparkles"],
    priority: 4
  };

  if (jobUrl) {
    payload.click = jobUrl;
    payload.actions = [
      {
        action: "view",
        label: "🚀 Apply Now",
        url: jobUrl,
        clear: true
      },
      {
        action: "copy",
        label: "📋 Copy Job Link",
        value: jobUrl
      },
      {
        action: "view",
        label: "📊 Latest Jobs",
        url: "https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md"
      }
    ];
  }

  return payload;
}

export function buildOverflowPayload(jobs, sentCount, topic) {
  const extraJobs = jobs.slice(sentCount);
  const lines = [
    `⚡ **+${extraJobs.length} more eligible jobs were discovered in this scan!**`,
    "",
    ...extraJobs.slice(0, 15).map(j => {
      const role = j.role || j.title || "New role";
      const comp = j.company || "Company";
      const link = j.job_url ? ` · [Apply](${j.job_url})` : "";
      return `• **${role}** — *${comp}*${link}`;
    })
  ];
  if (extraJobs.length > 15) {
    lines.push(`• ... and ${extraJobs.length - 15} more.`);
  }

  return {
    topic,
    title: `✨ +${extraJobs.length} More New Roles Discovered!`,
    message: lines.join("\n"),
    markdown: true,
    tags: ["sparkles", "star"],
    priority: 3,
    actions: [
      {
        action: "view",
        label: "📊 View All Jobs",
        url: "https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md"
      }
    ]
  };
}

export function buildHealthAlertPayload(alerts, topic) {
  const lines = [
    `⚠️ **${alerts.length} career source(s) reported issues during the latest scan:**`,
    "",
    ...alerts.map(a => `• **${a.company || a.company_id}**: \`${a.status}\` — ${a.diagnostic || "Requires attention"}`)
  ];

  return {
    topic,
    title: `⚠️ ${alerts.length} Career Source(s) Need Attention`,
    message: lines.join("\n"),
    markdown: true,
    tags: ["warning", "rotating_light"],
    priority: 2,
    actions: [
      {
        action: "view",
        label: "🔍 Source Health",
        url: "https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md#source-health"
      }
    ]
  };
}

export async function pushNtfy(server, payload, token) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers["Authorization"] = token.startsWith("Bearer ") || token.startsWith("Basic ") ? token : `Bearer ${token}`;
  }

  const endpoint = server.replace(/\/$/, "");
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`ntfy HTTP ${res.status} ${res.statusText}${errorText ? `: ${errorText}` : ""}`);
  }
  return await res.json().catch(() => ({}));
}

export async function sendBatchNotifications({
  batch,
  topic,
  server = "https://ntfy.sh",
  token = "",
  maxPerRun = MAX_PER_RUN,
  fetchFn = pushNtfy,
  pushedLogPath = path.join(ROOT, "data", "pushed_jobs.json")
}) {
  if (!topic) {
    console.log("NTFY_TOPIC not configured — skipping ntfy notifications.");
    console.log("To enable instant push notifications:");
    console.log("  1. Choose a private topic name (e.g. 'my-career-jobs-secret123')");
    console.log("  2. In GitHub Actions, add secret NTFY_TOPIC (Settings -> Secrets -> Actions)");
    console.log("     Or in config.json, add \"ntfy_topic\": \"your-topic\"");
    console.log("  3. Subscribe in the ntfy app (iOS/Android) or at https://ntfy.sh/<your-topic>");
    return { ok: 0, total: 0, alerts: 0, skipped: true, reason: "NO_TOPIC" };
  }

  const allJobs = Array.isArray(batch?.jobs) ? batch.jobs : [];
  const alerts = Array.isArray(batch?.health_alerts) ? batch.health_alerts : [];

  const pushedLog = await readJson(pushedLogPath, {});
  const nowIso = new Date().toISOString();

  // Deduplicate against previously pushed jobs
  const jobs = allJobs.filter(j => {
    const urlKey = (j.job_url || "").replace(/#.*$/, "").replace(/\/$/, "");
    const idKey = j.company_id && j.job_id ? `${j.company_id}:${clean(j.job_id).toLowerCase()}` : "";
    const canonicalKey = j.key || "";
    if (canonicalKey && pushedLog[canonicalKey]) return false;
    if (urlKey && pushedLog[urlKey]) return false;
    if (idKey && pushedLog[idKey]) return false;
    return true;
  });

  if (!jobs.length && !alerts.length) {
    console.log("ntfy: No new jobs or health alerts to push.");
    return { ok: 0, total: 0, alerts: 0, skipped: true, reason: "EMPTY_BATCH" };
  }

  const send = jobs.slice(0, maxPerRun);
  let ok = 0;

  for (const j of send) {
    const payload = buildJobPayload(j, topic);
    try {
      await fetchFn(server, payload, token);
      ok++;
      const urlKey = (j.job_url || "").replace(/#.*$/, "").replace(/\/$/, "");
      const idKey = j.company_id && j.job_id ? `${j.company_id}:${clean(j.job_id).toLowerCase()}` : "";
      if (j.key) pushedLog[j.key] = nowIso;
      if (urlKey) pushedLog[urlKey] = nowIso;
      if (idKey) pushedLog[idKey] = nowIso;
    } catch (e) {
      console.error(`ntfy job push failed for "${payload.title}": ${e.message}`);
    }
  }

  // Prune entries older than 30 days and save pushed log
  try {
    const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
    for (const [k, v] of Object.entries(pushedLog)) {
      if (new Date(v).getTime() < thirtyDaysAgo) delete pushedLog[k];
    }
    await fs.writeFile(pushedLogPath, JSON.stringify(pushedLog, null, 2), "utf8");
  } catch (error) {
    console.error(`Failed to update pushed_jobs.json: ${error.message}`);
  }

  if (jobs.length > send.length) {
    const overflowPayload = buildOverflowPayload(jobs, send.length, topic);
    try {
      await fetchFn(server, overflowPayload, token);
    } catch (e) {
      console.error(`ntfy overflow push failed: ${e.message}`);
    }
  }

  let alertsPushed = 0;
  if (alerts.length) {
    const healthPayload = buildHealthAlertPayload(alerts, topic);
    try {
      await fetchFn(server, healthPayload, token);
      alertsPushed = 1;
    } catch (e) {
      console.error(`ntfy health alert push failed: ${e.message}`);
    }
  }

  console.log(`ntfy: pushed ${ok}/${send.length} job notifications${alerts.length ? ` + ${alerts.length} health alert(s)` : ""}.`);
  return { ok, total: send.length, alerts: alertsPushed, skipped: false };
}

async function main() {
  const config = await readJson(path.join(ROOT, "config.json"), {});
  const topic = process.env.NTFY_TOPIC || config.ntfy_topic || "";
  const server = (process.env.NTFY_SERVER || config.ntfy_server || "https://ntfy.sh").replace(/\/$/, "");
  const token = process.env.NTFY_TOKEN || config.ntfy_token || process.env.NTFY_AUTH || "";

  const batch = await readJson(path.join(ROOT, "data", "last_batch.json"), {});
  await sendBatchNotifications({ batch, topic, server, token });
}

// Only execute main() when invoked directly as a script
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => {
    console.error(`ntfy notifier warning: ${e.stack || e.message}`);
  });
}
