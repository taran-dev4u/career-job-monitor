import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) {
  console.log("GitHub notification skipped: GITHUB_TOKEN or GITHUB_REPOSITORY is unavailable.");
  process.exit(0);
}
const [owner, repo] = repository.split("/");
const webRoot = `https://github.com/${owner}/${repo}`;
const batch = await readJson(path.join(ROOT, "data", "last_batch.json"), { jobs: [], health_alerts: [] });
const health = await readJson(path.join(ROOT, "data", "source_health.json"), []);
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
const api = async (endpoint, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${endpoint}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};
const ensureLabel = async (name, color, description) => {
  try { await api(`/labels/${encodeURIComponent(name)}`); }
  catch { try { await api("/labels", { method: "POST", body: JSON.stringify({ name, color, description }) }); } catch {} }
};
await ensureLabel("new-jobs", "1f883d", "New eligible jobs found by the monitor");
await ensureLabel("source-health", "d1242f", "Career source needs attention");

if (!batch.suppressed && batch.jobs?.length) {
  const rows = batch.jobs.map(job => `| ${job.company} | ${job.role} | ${job.location || "Not stated"} | ${job.job_type || "Not specified"} | ${job.required_experience_years ?? "Not stated"} | ${job.preferred_experience_years ?? "Not stated"} | ${job.sponsorship_status || "Not Mentioned"} | [Apply](${job.job_url}) |`).join("\n");
  await api("/issues", { method: "POST", body: JSON.stringify({
    title: `[New Jobs] ${batch.run_at.replace("T", " ").slice(0, 16)} UTC — ${batch.jobs.length} matches`,
    labels: ["new-jobs"],
    body: `@taran-dev4u — ${batch.jobs.length} newly eligible job(s) were found.\n\n| Company | Role | Location | Type | Required years | Preferred years | Sponsorship | Apply |\n|---|---|---|---|---:|---:|---|---|\n${rows}\n\n[Open Latest Jobs](${webRoot}/blob/main/LATEST_JOBS.md) · [Download workbook](${webRoot}/raw/main/outputs/job-monitor/Job_Monitor.xlsx)`
  }) });
}

const openIssues = await api("/issues?state=open&labels=source-health&per_page=100");
for (const item of batch.health_alerts || []) {
  const title = `[Source Health] ${item.company_id} ${item.company}`;
  const existing = openIssues.find(issue => issue.title === title);
  const body = `Status: **${item.status}**\n\n- Adapter: ${item.adapter}\n- Candidates: ${item.candidate_count}\n- Detail failures: ${item.detail_error_count}\n- Zero streak: ${item.zero_streak}\n- Degraded streak: ${item.degraded_streak}\n- Last healthy: ${item.last_healthy_at || "Never"}\n- Diagnostic: ${item.diagnostic || "No detail"}\n- Source: ${item.source_url}`;
  if (existing) await api(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  else await api("/issues", { method: "POST", body: JSON.stringify({ title, body: `@taran-dev4u\n\n${body}`, labels: ["source-health"] }) });
}
for (const issue of openIssues) {
  const id = issue.title.match(/\bCMP-\d{3}\b/)?.[0];
  const current = health.find(item => item.company_id === id);
  if (current && ["Healthy", "Confirmed Empty"].includes(current.status)) {
    await api(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Recovered automatically at ${current.run_at}. Current status: **${current.status}**.` }) });
    await api(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
  }
}
console.log(`GitHub notifications complete: ${batch.jobs?.length || 0} new jobs, ${batch.health_alerts?.length || 0} health alerts.`);
