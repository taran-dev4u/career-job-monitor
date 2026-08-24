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
import { clean, formatReleaseTimeline, isUsLocation, parseJobDate } from "./lib.mjs";

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

export function buildAuditAlertPayload(findings, topic) {
  const lines = [
    `A source is returning results, but they are not usable. This is the failure mode that hides jobs while every dashboard still reads healthy.`,
    "",
    ...findings.slice(0, 10).map(f => `• **${f.company}** — \`${f.code}\`\n  ${f.message}${f.evidence ? `\n  _${f.evidence}_` : ""}`)
  ];
  if (findings.length > 10) lines.push(`• ...and ${findings.length - 10} more.`);
  return {
    topic,
    title: `🛠 ${findings.length} source(s) failing their own checks`,
    message: lines.join("\n"),
    markdown: true,
    tags: ["hammer_and_wrench", "rotating_light"],
    priority: 4,
    actions: [{ action: "view", label: "🔍 Open dashboard", url: "https://taran-dev4u.github.io/career-job-monitor/" }]
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
  pushedLogPath = path.join(ROOT, "data", "pushed_jobs.json"),
  carryOverPath = path.join(ROOT, "data", "pending_push.json")
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

  // Jobs deferred by a previous run's MAX_PER_RUN cap go to the FRONT of the
  // queue, so a busy day drains over successive runs instead of losing the tail.
  const carried = await readJson(carryOverPath, {});
  const carriedJobs = Array.isArray(carried?.jobs) ? carried.jobs : [];
  if (carriedJobs.length) console.log(`ntfy: resuming ${carriedJobs.length} job(s) deferred by an earlier run.`);
  const batchJobs = Array.isArray(batch?.jobs) ? batch.jobs : [];
  const allJobs = [...carriedJobs, ...batchJobs];
  const alerts = Array.isArray(batch?.health_alerts) ? batch.health_alerts : [];
  const auditAlerts = Array.isArray(batch?.audit_alerts) ? batch.audit_alerts : [];

  const pushedLog = await readJson(pushedLogPath, {});
  const nowIso = new Date().toISOString();

  // One place that knows how a job maps to dedup-log keys, so the "have we
  // pushed this?" question and the "record that we pushed it" write can never
  // disagree about the key shape.
  const logKeys = j => [
    j.key || "",
    (j.job_url || "").replace(/#.*$/, "").replace(/\/$/, ""),
    j.company_id && j.job_id ? `${j.company_id}:${clean(j.job_id).toLowerCase()}` : ""
  ].filter(Boolean);
  const neverPushed = j => !logKeys(j).some(k => pushedLog[k]);

  // Deduplicate against previously pushed jobs, non-US locations, and stale publication dates (>48h old)
  const jobs = allJobs.filter(j => {
    const urlKey = (j.job_url || "").replace(/#.*$/, "").replace(/\/$/, "");
    const idKey = j.company_id && j.job_id ? `${j.company_id}:${clean(j.job_id).toLowerCase()}` : "";
    const canonicalKey = j.key || "";
    if (canonicalKey && pushedLog[canonicalKey]) return false;
    if (urlKey && pushedLog[urlKey]) return false;
    if (idKey && pushedLog[idKey]) return false;

    // Strict US location gate
    const locCheck = isUsLocation(j.location, j.description_snippet);
    if (!locCheck.accepted) {
      console.log(`ntfy: Skipping non-US job: "${j.role || j.title}" (${j.company}) - location: ${j.location}`);
      return false;
    }

    // Freshness gate - with one deliberate exception.
    //
    // monitor.mjs marks a job "notified" the moment it is first discovered,
    // whether or not a push ever went out. So a job carrying an old posting
    // date the FIRST time we see it (a newly added company, a scraper outage,
    // a pagination miss, a backfilled listing) was suppressed here and then
    // never offered again - silently, permanently.
    //
    // Freshness should stop us re-announcing stale listings, not stop a job
    // from ever being announced once. A job never pushed before gets exactly
    // one alert regardless of age, flagged as a catch-up rather than news.
    const dateCheck = parseJobDate(j.posted, 2);
    if (dateCheck.isExplicitlyOld) {
      if (neverPushed(j)) {
        j.__catchUp = true;
        console.log(`ntfy: First sighting of an older job, sending one catch-up alert: "${j.role || j.title}" (${j.company}) - posted ${j.posted}`);
        return true;
      }
      console.log(`ntfy: Skipping older job already handled: "${j.role || j.title}" (${j.company})`);
      return false;
    }

    return true;
  });

  if (!jobs.length && !alerts.length && !auditAlerts.length) {
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

  // Overflow is CARRIED OVER, not discarded.
  //
  // MAX_PER_RUN capped each run at 20 pushes and the summary named only the
  // next 15, so anything past #35 arrived as a bare count with no company,
  // role or link. Because monitor.mjs had already marked every one of them
  // notified, they were never offered again. One real run added 48 new jobs,
  // so 13 of them reached the user as nothing but a number. Deferred jobs are
  // now written to a carry-over queue and are deliberately NOT written to the
  // pushed log, so the next run picks them up from the front of the queue.
  if (jobs.length > send.length) {
    const deferred = jobs.slice(send.length);
    const overflowPayload = buildOverflowPayload(jobs, send.length, topic);
    try {
      await fetchFn(server, overflowPayload, token);
    } catch (e) {
      console.error(`ntfy overflow push failed: ${e.message}`);
    }
    try {
      await fs.writeFile(carryOverPath, JSON.stringify({ saved_at: nowIso, jobs: deferred }, null, 2), "utf8");
      console.log(`ntfy: deferred ${deferred.length} job(s) to the next run rather than dropping them.`);
    } catch (e) {
      console.error(`Failed to save the deferred push queue: ${e.message}`);
    }
  } else {
    try { await fs.rm(carryOverPath, { force: true }); } catch {}
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

  // A broken source is as urgent as a new job: if a company has stopped
  // producing usable results, every day it stays broken is jobs never seen.
  // These findings previously existed only in the Actions log.
  let auditPushed = 0;
  if (auditAlerts.length) {
    try {
      await fetchFn(server, buildAuditAlertPayload(auditAlerts, topic), token);
      auditPushed = 1;
    } catch (e) {
      console.error(`ntfy audit alert push failed: ${e.message}`);
    }
  }

  console.log(`ntfy: pushed ${ok}/${send.length} job notifications${alerts.length ? ` + ${alerts.length} health alert(s)` : ""}${auditAlerts.length ? ` + ${auditAlerts.length} source-audit finding(s)` : ""}.`);
  return { ok, total: send.length, alerts: alertsPushed, auditAlerts: auditPushed, deferred: Math.max(0, jobs.length - send.length), skipped: false };
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
