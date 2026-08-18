import path from "node:path";
import { evaluateEligibility, readJson } from "./lib.mjs";

const dt = value => value ? new Date(value) : "";
const text = value => value === null || value === undefined ? "" : value;
const join = value => Array.isArray(value) ? value.join("; ") : text(value);

export async function workbookSheets(root) {
  const companies = await readJson(path.join(root, "companies.json"), []);
  const config = await readJson(path.join(root, "config.json"), {});
  const jobs = await readJson(path.join(root, "data", "jobs.json"), []);
  const current = await readJson(path.join(root, "data", "current_candidates.json"), []);
  const audit = await readJson(path.join(root, "data", "decision_history.json"), []);
  const health = await readJson(path.join(root, "data", "source_health.json"), []);
  const runs = await readJson(path.join(root, "data", "runs.json"), []);
  const active = current.filter(item => item.accepted && item.active_status === "Active").sort((a, b) => String(b.first_seen_at).localeCompare(String(a.first_seen_at)));
  const historical = jobs.map(item => {
    if (item.decision || item.sponsorship_status) return item;
    const eligibility = evaluateEligibility({ title: item.role || item.title || "", context: item.match_reason || "", description: item.description_snippet || "", config });
    return { ...item, ...eligibility, title: item.role || item.title, first_seen_at: item.discovered_at, last_verified_at: item.discovered_at, active_status: item.active_status || "Unknown", decision: eligibility.accepted ? "Legacy — passes current policy" : "Legacy — rejected by current policy" };
  });
  const decisionHeaders = ["First Seen", "Last Verified", "Company ID", "Company", "Title", "Location", "Job Type", "Posted", "Job ID", "Apply URL", "Description Extracted", "Required Years", "Preferred Years", "Experience Evidence", "Sponsorship", "Sponsorship Evidence", "Student Enrollment", "Role Relevant", "Seniority", "Active Status", "Decision", "Exclusion Reasons", "Description Snippet", "Source URL"];
  const decisionRow = item => [dt(item.first_seen_at || item.discovered_at), dt(item.last_verified_at || item.evaluated_at), item.company_id, item.company, item.title || item.role, item.location, item.job_type || "Not specified", item.posted, String(item.job_id || ""), item.job_url, item.description_extracted ?? Boolean(item.description_snippet), text(item.required_experience_years), text(item.preferred_experience_years), item.experience_evidence || item.experience, item.sponsorship_status || "Legacy / not evaluated", item.sponsorship_evidence, item.student_enrollment, text(item.role_relevant), item.seniority, item.active_status || "Unknown", item.decision || "Legacy Included", join(item.exclusion_reasons), item.description_snippet, item.source_url];
  return [
    { name: "Apply Now", title: "Apply Now — Active Eligible Jobs", headers: decisionHeaders, rows: active.map(decisionRow), widths: [20,20,13,30,40,26,16,16,16,44,16,14,14,40,20,42,26,14,20,15,15,36,55,44], table: "ApplyNowTable" },
    { name: "New Jobs", title: "Newly Eligible Job History", headers: decisionHeaders, rows: historical.map(decisionRow), widths: [20,20,13,30,40,26,16,16,16,44,16,14,14,40,20,42,26,14,20,15,15,36,55,44], table: "NewJobsTable" },
    { name: "All Extracted Jobs", title: "Current Unfiltered Extraction Snapshot", headers: decisionHeaders, rows: current.map(decisionRow), widths: [20,20,13,30,40,26,16,16,16,44,16,14,14,40,20,42,26,14,20,15,15,36,55,44], table: "AllExtractedTable" },
    { name: "Decision Audit", title: `Eligibility Decision Audit — Rolling ${config.decision_history_days || 30} Days`, headers: ["Evaluated At", ...decisionHeaders], rows: audit.map(item => [dt(item.evaluated_at), ...decisionRow(item)]), widths: [20,20,20,13,30,40,26,16,16,16,44,16,14,14,40,20,42,26,14,20,15,15,36,55,44], table: "DecisionAuditTable" },
    { name: "Source Health", title: "Source Health — All Configured Companies", headers: ["Run At", "Company ID", "Company", "Status", "Adapter", "HTTP", "Candidates", "Details OK", "Detail Errors", "Pending", "Eligible", "Rejected", "Zero Streak", "Degraded Streak", "Last Candidate", "Last Healthy", "Diagnostic", "Resolved URL", "Customized Source URL"], rows: companies.map(company => { const item = health.find(x => x.company_id === company.id) || {}; return [dt(item.run_at), company.id, company.company, item.status || "Not Yet Scanned", item.adapter || "", text(item.http_status), text(item.candidate_count), text(item.detail_success_count), text(item.detail_error_count), text(item.pending_detail_count), text(item.eligible_count), text(item.rejected_count), text(item.zero_streak), text(item.degraded_streak), dt(item.last_candidate_at), dt(item.last_healthy_at), item.diagnostic || "", item.resolved_url || "", company.career_url]; }), widths: [20,13,34,18,20,10,13,13,14,12,12,12,13,16,20,20,46,48,55], table: "SourceHealthTable" },
    { name: "Run Log", title: "Monitor Run Log", headers: ["Run At", "Mode", "Companies", "Candidates", "Evaluations", "New Jobs", "Healthy", "Confirmed Empty", "Degraded", "Broken", "Errors", "Duration (seconds)"], rows: runs.map(run => [dt(run.run_at), run.mode, run.companies_checked, run.candidates_seen, text(run.evaluations_completed), run.new_jobs_added, text(run.healthy_sources), text(run.confirmed_empty_sources), text(run.degraded_sources), text(run.broken_sources), run.errors, run.duration_seconds]), widths: [20,20,14,14,14,13,12,18,13,12,12,19], table: "RunLogTable" },
    { name: "Companies", title: "Career Page Monitor — Company Registry", headers: ["Company ID", "Company Name", "Customized Career URL", "Active", "Scan Interval (minutes)"], rows: companies.map(company => [company.id, company.company, company.career_url, true, config.interval_minutes || 30]), widths: [14,42,95,11,22], table: "CompaniesTable" }
  ];
}
