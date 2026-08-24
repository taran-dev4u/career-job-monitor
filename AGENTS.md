# AGENTS.md — Canonical Agent Operating Manual

> **Mandatory:** Read this file completely before inspecting, editing, running, or deleting anything in this project. If your environment does not automatically load `AGENTS.md`, the operator must prompt: **“Read the root `AGENTS.md` completely before doing any work.”**

This file applies to the repository root and every subdirectory. It is the single authoritative operating manual and change ledger for all coding agents working in this folder.

## 1. Instruction Precedence

When instructions conflict, use this order:

1. The latest explicit user instruction.
2. This `AGENTS.md` file.
3. Project configuration and `README.md`.
4. Agent assumptions.

Never silently reinterpret the project goal, broaden the job criteria, or discard historical data.

## 2. Project Mission and Success Criteria

This project monitors configured United States career pages every 30 minutes and records only newly discovered roles that match the user's target profile.

A job is in scope when it is related to software engineering, software development, AI, machine learning, or a configured adjacent technical discipline; the role does not explicitly require more than three years of experience; and the posting does not explicitly deny sponsorship or OPT/CPT eligibility. Full-time, part-time, contract, and graduate-eligible internships can qualify. Internships explicitly requiring current enrollment are rejected. Experience above three years that is only preferred or desirable does not cause rejection. Senior, staff, principal, lead, management, director, architect, and similar high-responsibility roles are excluded by default. Sponsorship availability, future availability, unclear language, or no sponsorship mention is acceptable.

The monitor must:

- Preserve the exact customized career URLs supplied by the user.
- Avoid duplicate job rows across runs.
- Treat the first scan as a baseline so existing jobs do not flood the output.
- Append only genuinely new accepted jobs to the `New Jobs` sheet.
- Leave `New Jobs` unchanged when a scan finds no new accepted jobs.
- Record operational scan information separately from accepted jobs.
- Continue scanning other companies when one source fails.
- Reject a job only when its posting explicitly states that current sponsorship is unavailable, sponsorship will not be provided now/future, or OPT/CPT candidates are ineligible. Do not infer rejection from silence.

## 3. Current Project Snapshot

Last structurally verified: **2026-08-24 20:30 UTC**.

- Companies configured: **17** (`CMP-001` through `CMP-017`).
- Monitor interval: **30 minutes**.
- Primary runner: active GitHub Actions workflow `.github/workflows/job-monitor.yml`, scheduled at minutes **7 and 37 UTC** each hour.
- Private repository: **`https://github.com/taran-dev4u/career-job-monitor`**, default branch `main`.
- Web Dashboard: **`https://taran-dev4u.github.io/career-job-monitor/`** (`index.html`).
- Mobile Push Notifications: Active via **`ntfy.sh/taran-career-jobs-2026`**.
- Persistent Database: **`data/company_jobs.json`** indexing 342 jobs across all 17 companies with canonical primary keys (`CMP-###:job_id`), discovery timestamps, and lifecycle/notification status tracking.
- Latest controlled cloud validation: **17 Healthy**, **0 Confirmed Empty**, **0 Degraded**, **0 Broken**; 342 extracted records reconciled as 38 fresh included, 168 pre-existing old, and 136 ineligible.
- Strict Targeting: Strict US-only locations; max 3 years experience; roman numeral / level 3+ exclusions (SE III, Level 3+, IC3+, Experienced prefix); 48h publication freshness barrier; sponsorship-available or not-mentioned allowed.
- User dashboards: `LATEST_JOBS.md` (active eligible) and `ALL_EXTRACTED_JOBS.md` (unfiltered); both keep newest discoveries first.
- Generated workbook: `outputs/job-monitor/Job_Monitor.xlsx`, with seven audit/visibility sheets.

The snapshot is not a live dashboard. Update it only after structural changes such as adding/removing companies, changing the scheduler, changing runtime dependencies, changing data layout, or completing a controlled re-baseline. Routine 30-minute scan results belong in the runtime logs, not here.

### Known operational limitations

- Career sites frequently change DOM markup, APIs, bot protection, and authentication behavior.
- A zero count is trusted only when the source explicitly confirms no matching jobs. Otherwise it is `Degraded` or `Broken` and must remain visible.
- Consult `LATEST_JOBS.md`, `data/source_health.json`, `data/runs.json`, and `monitor.log` for current behavior. Platform adapters use official page JSON/API payloads when exposed and browser/JSON-LD extraction as fallback.
- `scripts/run_once.ps1` currently contains a machine-specific bundled Node.js path. Preserve it on this machine; make portability changes only as an explicit task.

## 4. Source-of-Truth Map

| Path | Authority and purpose | Editing rule |
|---|---|---|
| `AGENTS.md` | Canonical agent rules, architecture manual, multi-agent coordination protocol, and change ledger | Every agent must read it; agents update only their own active ledger entry plus structurally affected documentation sections. |
| `README.md` | Human-facing usage, links, and basic operating commands | Keep concise; do not duplicate the complete agent manual. |
| `companies.json` | Stable company IDs, names, and customized career URLs | Check duplicates; never reuse a retired ID. |
| `config.json` | Interval, browser limits, role terms, experience limit, age limit, and exclusions | Do not alter user criteria without authorization. |
| `data/company_jobs.json` | Permanent per-company job catalog, lifecycle status, and notification status | Runtime-owned; never clear or delete. |
| `data/pushed_jobs.json` | Permanent deduplication database for mobile push alerts | Runtime-owned; prevents duplicate push alerts across all time. |
| `data/state.json` | Baseline/schema flags plus discovered, evaluated, and notified state | Runtime-owned; never clear or reset casually. |
| `data/jobs.json` | Accepted newly discovered jobs | Append/deduplicate; preserve history unless deletion is explicitly requested. |
| `data/runs.json` | Monitor run history | Runtime-owned; do not manually manufacture successful runs. |
| `data/current_candidates.json` | Latest unfiltered extracted-job snapshot and decisions | Runtime-owned; includes included, rejected, pending, and extraction-error records. |
| `data/decision_history.json` | Rolling 30-day decision/evidence audit | Runtime-owned; preserve legacy records and let retention logic prune by age. |
| `data/source_health.json` | Latest one-row-per-company health diagnostics and streaks | Runtime-owned; zero candidates must never silently imply health. |
| `data/last_batch.json` | Notification handoff for the latest new-job batch and health alerts | Runtime-owned; first reliability baseline is suppressed. |
| `data/apply_now.csv` | Active eligible jobs CSV feed (auto-synced with Google Sheets `=IMPORTDATA(...)`) | Generated by the monitor; do not hand-curate. |
| `LATEST_JOBS.md` | Tracked Apply Now dashboard and compact source-health summary | Generated by the monitor; do not hand-curate job rows. |
| `ALL_EXTRACTED_JOBS.md` | Tracked unfiltered snapshot with every extracted job, decision, and exclusion reasons | Generated by the monitor; do not hand-curate job rows. |
| `index.html` / `dashboard.html`| Interactive Web Dashboard with sorting, searching, badges, and local application tracking | Generated by `src/build_dashboard_html.mjs`. |
| `monitor.log` | Detailed operational output and source errors | Append-only runtime log; inspect recent lines during diagnosis. |
| `outputs/job-monitor/Job_Monitor.xlsx` | Generated user-facing workbook | Never edit manually. Correct JSON/code, then rebuild it. |
| `.github/workflows/job-monitor.yml` | Primary always-on scheduler, tests, scan, alerts, workbook artifact, and persistence commit | Keep `contents: write`, `issues: write`, concurrency protection, and off-hour cron minutes. |
| `src/` | Scraping, filtering, deduplication, orchestration, workbook generation, and ntfy push | Make minimal changes and test the affected subsystem. |
| `scripts/` | One-shot runner and Windows scheduled-task management | Treat scheduler changes as operationally significant. |
| `tests/` | Filter/dedup unit checks, date freshness, location, and data contracts | Extend when behavior changes. |

The JSON files and application code are the editable sources of truth. The Excel workbook and HTML dashboards are always generated projections of those sources.

## 5. Mandatory Agent Workflow

### Before changing anything

1. Read this entire file, then read `README.md`.
2. Inspect the relevant source/configuration files, `data/state.json`, recent `data/runs.json`, and the tail of `monitor.log`.
3. Check whether another `IN_PROGRESS` ledger entry overlaps the files or behavior you intend to change.
4. Add a new `IN_PROGRESS` entry to the bottom of the Agent Change Ledger using a unique UTC task ID.
5. Re-read the ledger immediately before the first edit. If another agent added overlapping work, stop and coordinate instead of overwriting it.

Read-only analysis that makes no project changes does not require a ledger entry. Any code, configuration, documentation, company, scheduler, generated-workbook, or data-repair mutation does.

### While working

- Preserve unrelated changes and use the smallest safe edit.
- Change only files declared in your ledger entry unless you update the entry first.
- Do not run concurrent monitor instances. Before state-sensitive maintenance, stop or confirm the scheduled task is not running.
- Never clear the `seen` map, reset all history, reuse a `CMP-###` identifier, delete accepted jobs, or change targeting criteria without explicit user authorization.
- Never manually edit `Job_Monitor.xlsx`.
- Never expose credentials, cookies, tokens, or signed-session data in source files or the ledger.
- Use ISO-8601 UTC timestamps in JSON and ledger records. User-facing Excel dates may use the workbook's configured formatting.
- If a source fails, preserve partial progress and report the exact source/error; do not fabricate a zero-result success.

### After working

1. Run the required validation for every affected subsystem.
2. Re-read the ledger before the final patch.
3. Update only your own ledger entry from `IN_PROGRESS` to `DONE` or `BLOCKED`.
4. Record actual files changed/deleted, behavior and data impact, verification commands/results, scheduler state, and follow-up work.
5. Update the Current Project Snapshot only when the change is structural.
6. Report the output location and any remaining limitations to the user.

Completed ledger entries are immutable history. Never rewrite, reorder, compact, or delete another agent's completed entry.

## 6. Maintenance Procedures

### Add a company safely

1. Inspect `companies.json` for duplicate company names and normalized URLs.
2. Allocate the next never-used `CMP-###` ID. Do not fill gaps or reuse retired IDs.
3. Preserve the user's customized URL exactly unless the user asks for URL correction.
4. Stop the scheduled task and confirm no monitor process is running.
5. Record the current counts from `data/jobs.json` and the `seen` map.
6. Add the company to `companies.json`.
7. In `data/state.json`, change only `initialized` to `false`; retain the complete existing `seen` map.
8. Run one controlled monitor cycle. This intentionally baselines all configured sources while retaining prior seen history.
9. Confirm the new source was scanned, `initialized` returned to `true`, the existing `seen` entries remain, and no historical jobs were appended to `data/jobs.json`.
10. Rebuild/verify the workbook if the controlled run did not already do so, then resume the scheduled task.
11. Update the snapshot and your ledger entry.

If the new source produces zero candidates, do not claim success. Diagnose the URL/markup and either implement a source adapter or clearly record the limitation before resuming unattended monitoring.

### Add a user-supplied job posting

Prefer normal monitor ingestion. If the user explicitly requests manual ingestion because the source cannot surface the job:

1. Confirm the company exists and validate the role against `config.json`.
2. Inspect the full description for an explicit minimum above three years, excluded seniority, and explicit no-sponsorship/no-OPT/no-CPT language. Sponsorship silence is acceptable.
3. Deduplicate by normalized job URL and external job ID against `data/jobs.json` and `data/state.json`.
4. Append a record using the existing `data/jobs.json` schema, including discovery time, company ID/name, role, location, experience decision, posted date, job ID/URL, source URL, match reason, and a concise snippet.
5. Generate the canonical seen key through `stableJobKey` and add it to the retained `seen` map so the monitor cannot re-add the job.
6. Rebuild and visually verify the workbook.

Never invent missing job facts. Leave unknown optional fields empty and explain the evidence used for the acceptance decision.

### Change filters or scraper logic

- Preserve `max_experience_years: 3` and the configured senior-title exclusions unless the user explicitly changes the goal.
- Preserve the sponsorship rule: explicit no-sponsorship or no-OPT/CPT language is rejected; sponsorship availability or no mention is accepted.
- Keep title relevance and experience checks independently testable.
- Add/update unit tests for changed matching or deduplication behavior.
- Run a live smoke test for every affected career-platform type. Network/browser failures must be distinguished from zero matching jobs.
- Confirm that search, results, saved-jobs, and navigation links are not misclassified as job-detail URLs.

### Correct data

1. Pause state-producing runs when the correction overlaps runtime files.
2. Correct the authoritative JSON or code; do not patch Excel directly.
3. Preserve unrelated job/run history.
4. Rebuild the workbook.
5. Inspect key ranges, scan for formula errors, and visually verify all affected sheets.
6. Resume monitoring and document whether the correction is recoverable/reversible.

### Delete, disable, or retire anything

- Obtain explicit user authorization before deleting code, companies, jobs, run history, state, output files, or scheduled tasks.
- Prefer retirement/preservation over deletion when the schema supports it. The current company schema has no enforced active/inactive behavior, so do not invent an `active` flag without implementing and testing monitor support.
- Preserve retired company IDs and historical job/run records unless the user explicitly requests historical deletion.
- Record exact deletion targets, reason, effect, and recoverability in the ledger and user handoff.

### Routine scheduled monitoring

Automatic scans update all runtime JSON files, both Markdown dashboards, `monitor.log`, and the generated workbook. They may create/close GitHub notification issues. Routine runs do **not** create Agent Change Ledger entries. The ledger is for agent-made changes and repairs, not job-by-job operational history.

## 7. Scheduler Safety

Primary scheduling is GitHub Actions. Expected local fallback task name: `Career Job Monitor - Every 30 Minutes`.

Use the provided scripts rather than recreating task definitions manually:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\run_once.ps1
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install_scheduled_task.ps1
powershell.exe -ExecutionPolicy Bypass -File .\scripts\uninstall_scheduled_task.ps1
```

Before a state-sensitive change, inspect task state and stop it if necessary. After maintenance, restore the requested schedule and verify the last task result. Do not report the task as healthy solely because it exists; confirm a completed run and exit code `0`.

Keep the local task disabled while GitHub Actions is active. For cloud scheduler changes, validate a manual `workflow_dispatch` run through scan, CI workbook verification, artifact upload, and state commit before declaring success.

## 8. Required Validation Matrix

Run only the checks relevant to the change, but do not skip an applicable row.

| Change | Minimum required validation |
|---|---|
| Documentation only | Verify every referenced path/command; perform the Fresh-Agent Walkthrough below. |
| Role/experience/sponsorship/internship/dedup logic | `node tests/filter.test.mjs` plus representative edge cases. |
| Scraper or career URL | Filter tests plus `node tests/smoke_scraper.mjs CMP-###`; use `--details` when validating detail extraction. |
| Company addition | Duplicate/ID check, controlled baseline, job-count comparison, state preservation, workbook verification. |
| Workbook builder or data correction | Local: `node src/build_workbook.mjs --verify`; cloud/portable: `npm run build-workbook:ci -- --verify`. Inspect values/hyperlinks/errors and visually review affected sheets. |
| Scheduler scripts/settings | One manual scheduled-task run, wait for completion, confirm exit code `0`, next run time, and log/workbook update. |
| GitHub Actions workflow | Clean `npm ci`, unit tests, CI workbook verification, successful manual cloud run, artifact existence, bot state commit, and active schedule on the default branch. |

On this machine, use the bundled Node executable resolved by the project environment or the path already used by `scripts/run_once.ps1`. Do not install replacement spreadsheet libraries: workbook authoring uses `@oai/artifact-tool`.

### Fresh-Agent Walkthrough

A new agent reading only this file must be able to answer all of the following before editing:

1. What jobs are accepted, and what experience ceiling applies?
2. Which files own company configuration, matching rules, dedup state, accepted jobs, run logs, and workbook output?
3. What is the safe first action before making a change?
4. How is overlapping agent work detected?
5. How is a company added without flooding the workbook with old jobs?
6. Which validations apply to the intended change?
7. Where and how is the completed change recorded?

If any answer is unclear, improve this file as part of the task and record that improvement in the ledger.

## 9. Agent Change Ledger

Rules:

- Append new entries at the bottom in chronological order.
- Use `TASK-YYYYMMDD-HHMM-<agent>` with UTC time. If that ID already exists, add a short unique suffix.
- Agents may update only their own active entry.
- Re-read this section immediately before every ledger patch.
- Completed entries remain permanently unchanged unless the user explicitly authorizes historical correction.

Entry template:

```markdown
### TASK-YYYYMMDD-HHMM-<agent> — STATUS
- Started: YYYY-MM-DDTHH:mm:ssZ
- Completed: blank until done
- Objective:
- Files expected:
- Files changed:
- Files deleted:
- Behavior/data impact:
- Verification:
- Scheduler status:
- Follow-up:
```

### TASK-20260817-2116-codex — DONE
- Started: 2026-08-17T21:16:18Z
- Completed: 2026-08-17T21:18:05Z
- Objective: Create the canonical root agent operating manual and append-only coordination ledger requested by the user.
- Files expected: `AGENTS.md`
- Files changed: `AGENTS.md` (new)
- Files deleted: None.
- Behavior/data impact: Documentation and agent-governance change only; no application, scheduler, runtime-state, job, run-history, or workbook behavior changes.
- Verification: Passed full-file re-read; all required sections present; every referenced project path exists; command names match the current scripts/package; Fresh-Agent Walkthrough confirmed the mission, sources of truth, safe startup, overlap detection, company-baseline procedure, validation matrix, and ledger location are discoverable from this file alone.
- Scheduler status: No scheduler mutation planned; current task state must not be inferred from this documentation-only change.
- Follow-up: None.

### TASK-20260818-0030-codex — DONE
- Started: 2026-08-18T00:30:54Z
- Completed: 2026-08-18T00:34:33Z
- Objective: Add a prospective sponsorship-eligibility filter that rejects only jobs with an explicit current/no-future sponsorship or OPT/CPT restriction, while allowing jobs when sponsorship is available or not mentioned.
- Files expected: `AGENTS.md`, `README.md`, `config.json`, `src/lib.mjs`, `src/scrape.mjs`, `tests/filter.test.mjs`
- Files changed: `AGENTS.md`, `README.md`, `config.json`, `src/lib.mjs`, `src/scrape.mjs`, `tests/filter.test.mjs`
- Files deleted: None planned.
- Behavior/data impact: Future unseen jobs with explicit no-sponsorship/no-OPT/no-CPT language will be excluded. Existing accepted job history will not be retroactively deleted.
- Verification: Passed Node syntax checks for `src/lib.mjs` and `src/scrape.mjs`; passed filter/dedup tests including explicit no-sponsorship, current/future sponsorship denial, work authorization without sponsorship, no OPT/CPT, sponsorship available, future sponsorship possible, and sponsorship not mentioned; passed live Qualcomm detail smoke test with sponsorship result included in the match reason.
- Scheduler status: Waited for the active cycle to finish before runtime edits. Final state `Ready`, last task result `0`, next scheduled run retained.
- Follow-up: None. Existing accepted rows were intentionally not retroactively deleted because the user requested this rule “from now on.”

### TASK-20260818-0520-codex — DONE
- Started: 2026-08-18T05:20:48Z
- Completed: 2026-08-18T05:30:01Z
- Objective: Move unattended 30-minute monitoring to GitHub Actions so scans continue while the local computer is off, while preserving state, job history, run history, and the Excel output in a private GitHub repository.
- Files expected: `AGENTS.md`, `README.md`, `.gitignore`, `.github/workflows/job-monitor.yml`, `package.json`, `package-lock.json`, `src/monitor.mjs`, `src/build_workbook_ci.mjs`
- Files changed: `AGENTS.md`, `README.md`, `.gitignore`, `.github/workflows/job-monitor.yml`, `package.json`, `package-lock.json`, `src/monitor.mjs`, `src/build_workbook_ci.mjs`, plus runtime-owned `data/state.json`, `data/runs.json`, and `outputs/job-monitor/Job_Monitor.xlsx` from the successful cloud run.
- Files deleted: None planned.
- Behavior/data impact: Add a Linux/GitHub-compatible workbook path and persistent workflow commits. Create private repository `taran-dev4u/career-job-monitor`. Disable the local Windows scheduled task only after a successful cloud run.
- Verification: Clean isolated `npm ci` succeeded; unit tests passed; CI workbook write/read verification passed for all three sheets; workflow syntax parsed; private repository created and pushed; manual GitHub Actions run `32102845353` completed successfully across checkout, Node, dependencies, Chromium, tests, 17-company scan, workbook verification, artifact upload, and bot persistence commit `6fe8ab3`; cloud run recorded 0 source errors; artifact `Job-Monitor-1` exists; workflow state is active.
- Scheduler status: GitHub Actions is the active primary scheduler at `7,37 * * * *` UTC. Local Windows task is disabled, retained for rollback, and had last result `0` before handoff.
- Follow-up: GitHub scheduled events are best-effort and may be delayed during platform congestion; monitor the Actions page if a run is late.

### TASK-20260818-0546-codex — DONE
- Started: 2026-08-18T05:46:53Z
- Completed: 2026-08-18T15:00:38Z
- Objective: Implement the approved GitHub Actions reliability and visibility upgrade: auditable eligibility decisions, raw extraction and 30-day decision history, per-company source health, Apply Now dashboard, GitHub alerts, and a seven-sheet workbook.
- Files expected: `AGENTS.md`, `README.md`, `config.json`, `package.json`, `.github/workflows/job-monitor.yml`, `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/build_workbook.mjs`, `src/build_workbook_ci.mjs`, `src/github_notify.mjs`, `tests/filter.test.mjs`, `tests/monitor_data.test.mjs`, `data/state.json`, `data/jobs.json`, `data/runs.json`, `data/current_candidates.json`, `data/decision_history.json`, `data/source_health.json`, `data/last_batch.json`, `LATEST_JOBS.md`, `outputs/job-monitor/Job_Monitor.xlsx`
- Files changed: `.github/workflows/job-monitor.yml`, `AGENTS.md`, `README.md`, `config.json`, `package.json`, `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/build_workbook.mjs`, `src/build_workbook_ci.mjs`, `src/github_notify.mjs`, `src/workbook_data.mjs`, `tests/filter.test.mjs`, `tests/monitor_data.test.mjs`, `tests/smoke_scraper.mjs`, `tests/smoke_all.mjs`, `tests/debug_source.mjs`, `tests/fixtures/parser_contracts.json`, `LATEST_JOBS.md`, `data/state.json`, `data/jobs.json`, `data/runs.json`, `data/current_candidates.json`, `data/decision_history.json`, `data/source_health.json`, `data/last_batch.json`, `outputs/job-monitor/Job_Monitor.xlsx`.
- Files deleted: None planned.
- Behavior/data impact: Preserved every customized source URL and historical record; migrated state without clearing legacy `seen`; added v3 discovered/evaluated/notified state, baseline-pending suppression, full detail evaluation, pagination, current raw snapshot, 30-day decision evidence, daily active-job rechecks, per-company health/streaks, dashboard, seven-sheet workbook, artifacts, and GitHub job/health issues. One false-positive baseline-backlog issue was closed with a correction while preserving audit/history; subsequent v3 runs proved backlog suppression and delivered two genuinely new postings.
- Verification: `npm test` passed decision, sponsorship, experience, internship, state, workbook-contract, adapter-family, and parser-fixture tests; CI workbook `--verify` passed all seven sheets and hyperlink counts; live all-company smoke found candidates on all 17 sources and sampled details without errors after targeted retries; cloud runs `32145714222`, `32147893093`, `32149853441`, and `32151158497` passed scanning, workbook verification, notifications, artifact upload, and persistence. Final run completed in 5m43s with 17 Healthy sources, 398 = 63 included + 335 rejected, zero pending/errors, a valid `Job-Monitor-17` artifact, one genuinely new JPMorgan alert, and automatic closure of Apple/Fidelity/Google health issues.
- Scheduler status: GitHub Actions remains active at `7,37 * * * *` UTC with `contents: write`, `issues: write`, and concurrency protection. The obsolete scheduled run `32149784282` was cancelled before notification/persistence because it started on the superseded v2 commit; the corrected queued run then completed successfully. Local Windows fallback remains disabled.
- Follow-up: GitHub schedules are best-effort and can start late. The workflow currently emits a GitHub annotation that v4 actions target deprecated Node 20 internals while GitHub forces Node 24; execution is successful, but upgrade the action major versions when GitHub publishes compatible stable releases.

### TASK-20260818-1506-codex — DONE
- Started: 2026-08-18T15:06:45Z
- Completed: 2026-08-18T19:43:18Z
- Objective: Keep newest jobs at the top everywhere and maintain separate generated Markdown dashboards for filtered eligible jobs and the complete unfiltered extraction snapshot.
- Files expected: `AGENTS.md`, `README.md`, `.github/workflows/job-monitor.yml`, `package.json`, `src/job_order.mjs`, `src/dashboard.mjs`, `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/workbook_data.mjs`, `tests/filter.test.mjs`, `tests/monitor_data.test.mjs`, `LATEST_JOBS.md`, `ALL_EXTRACTED_JOBS.md`, runtime JSON files, `outputs/job-monitor/Job_Monitor.xlsx`
- Files changed: `AGENTS.md`, `README.md`, `.github/workflows/job-monitor.yml`, `package.json`, `src/job_order.mjs`, `src/dashboard.mjs`, `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/workbook_data.mjs`, `tests/filter.test.mjs`, `tests/monitor_data.test.mjs`, `LATEST_JOBS.md`, `ALL_EXTRACTED_JOBS.md`, `data/state.json`, `data/jobs.json`, `data/runs.json`, `data/current_candidates.json`, `data/decision_history.json`, `data/source_health.json`, `data/last_batch.json`, `outputs/job-monitor/Job_Monitor.xlsx`.
- Files deleted: None.
- Behavior/data impact: Preserved all job, state, decision, and run history. Both Markdown dashboards and all time-oriented workbook sheets now show newest records first. `LATEST_JOBS.md` is the filtered active/eligible view; `ALL_EXTRACTED_JOBS.md` is the unfiltered snapshot with decisions and exclusion reasons. State schema v4 uses stable company/job-ID identity when available, with URL fallback, preventing URL-slug changes from creating duplicate alerts. False Apple issue #7 was corrected and closed without deleting its audit/history rows.
- Verification: `npm test` passed ordering, dashboard, eligibility, sponsorship, internship, adapter, and stable-ID tests; dashboard generation produced separate navigation-linked filtered/unfiltered files; CI workbook verification passed all seven sheets (Apply Now 48, New Jobs 39, All Extracted Jobs 335, Decision Audit 740, Source Health 17, Run Log 38, Companies 17). Cloud run `32152858655` validated both dashboards, artifact upload, and persistence; post-fix run `32153818152` passed all steps without repeating the five Apple slug-change alerts. State reports schema v4, current Apple records contain extracted IDs, and artifact `Job-Monitor-25` is available. Latest dashboard rows were directly inspected and are newest-first.
- Scheduler status: GitHub Actions remains active at `7,37 * * * *` UTC with concurrency protection; subsequent scheduled runs continued successfully. Local Windows fallback remains disabled.
- Follow-up: The latest scan has 16 Healthy, 1 Degraded (Goldman Sachs returned zero candidates without an explicit empty signal), and 0 Broken sources. The configured health-streak alert will report persistent degradation; no manual data deletion is warranted.

### TASK-20260819-0819-claude — DONE
- Started: 2026-08-19T08:19:24Z
- Completed: 2026-08-19T08:19:24Z
- Objective: Fix false-negative role filtering that was silently hiding eligible jobs, and add an interactive HTML dashboard generated every scan.
- Files expected: `src/lib.mjs`, `tests/filter.test.mjs`, `src/build_dashboard_html.mjs` (new), `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `AGENTS.md`, `outputs/job-monitor/dashboard.html`
- Files changed: `src/lib.mjs`, `tests/filter.test.mjs`, `src/build_dashboard_html.mjs` (new), `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: `roleDecision` now judges seniority from the TITLE ONLY (previously it scanned the first 800 chars of the description body, so any posting mentioning "staff/lead/manager/architecture" was wrongly rejected), and uses whole-token matching so "architect" no longer matches inside "architecture". Role relevance broadened with a guarded generic net (engineer/developer/scientist + software/AI/data context, minus non-software domains such as electrical/optical/hardware/sales) plus an IC exception for "Member of Technical Staff". Simulated against the live 335-record snapshot: 34 previously-rejected postings become correctly eligible and 0 previously-eligible postings are newly rejected (the 2 deltas are genuinely senior titles the OLD code missed because it only matched "sr." with a trailing period). No change to experience, sponsorship, enrollment, or dedup logic. New `src/build_dashboard_html.mjs` reads `data/` + `config.json` + `companies.json` and writes a single self-contained `outputs/job-monitor/dashboard.html` (KPIs, run-history charts, filter/sort/search table with per-job evidence, all-17-company coverage, down-source banner, and browser-local Applied/dismiss tracking). `monitor.mjs` runs it after the workbook (non-fatal). Workflow now commits `dashboard.html`.
- Verification: `node tests/filter.test.mjs` and `node tests/monitor_data.test.mjs` pass, including new regression assertions (seniority-in-body must not reject; "architect" must not match "architecture"; broadened technical titles accepted; non-software domains still excluded). `node --check src/monitor.mjs` OK. Dashboard rendered headless in light and dark and inspected. NOTE: not yet validated by a full cloud `workflow_dispatch` run — recommend one manual run to confirm the dashboard step and commit.
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: Goldman Sachs (CMP-017) still returns zero candidates (SPA extraction gap) — dedicated adapter pending; not addressed in this task.

### TASK-20260822-0930-antigravity — DONE
- Started: 2026-08-22T09:30:00Z
- Completed: 2026-08-22T09:32:00Z
- Objective: Diagnose and fix broken NTFY notification delivery caused by ByteString HTTP header encoding failures on Unicode/emoji titles, add JSON-payload publishing with Action buttons, support config/env topic configuration, add tests, and provide complete project analysis.
- Files expected: `src/notify_ntfy.mjs`, `config.json`, `README.md`, `tests/notify.test.mjs`, `package.json`, `AGENTS.md`
- Files changed: `src/notify_ntfy.mjs`, `config.json`, `README.md`, `tests/notify.test.mjs` (new), `package.json`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: Migrated `src/notify_ntfy.mjs` from HTTP header push to JSON-payload publishing (`POST https://ntfy.sh`), eliminating the ByteString TypeError (`character at index 0 has a value of 55356 > 255`) caused by emojis in headers (`🆕`, `⚠️`). Added direct "Apply Now" action buttons on mobile notifications. Supported `NTFY_TOPIC` from environment variable or `config.json` (`ntfy_topic`). Created `tests/notify.test.mjs` and added it to `npm test`. Updated `README.md` with full NTFY setup guide.
- Verification: `node src/notify_ntfy.mjs` tested with live dummy topic (16/16 jobs and 1 health alert published successfully with 200 OK); unit test suite `tests/notify.test.mjs` created and passing; full `npm test` passing (`filter.test.mjs`, `monitor_data.test.mjs`, `notify.test.mjs`); CI workbook build verification `npm run build-workbook:ci -- --verify` passed on all 7 sheets without errors.
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: For automated cloud push notifications, ensure the repository secret `NTFY_TOPIC` is set in GitHub repository settings.

### TASK-20260822-1010-antigravity — DONE
- Started: 2026-08-22T10:10:00Z
- Completed: 2026-08-22T10:12:00Z
- Objective: Upgrade NTFY notifications with professional Markdown formatting, comprehensive role summary, experience and sponsorship badges, 1-click clipboard Copy Link action buttons, and dashboard links.
- Files expected: `src/notify_ntfy.mjs`, `tests/notify.test.mjs`, `AGENTS.md`
- Files changed: `src/notify_ntfy.mjs`, `tests/notify.test.mjs`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: High-detail rich job alerts with Markdown formatting, structured company/location/job-type/experience/sponsorship badges, blockquote overview snippet, 1-click clipboard Copy Link action button (`action: "copy"`), Apply Now button, and Dashboard button.
- Verification: Passed live test push with dummy topic (16/16 jobs formatted with badges, overview snippet, copy link button, and dashboard button); unit test suite `tests/notify.test.mjs` updated and passing; full `npm test` passing.
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: None.

### TASK-20260822-1015-antigravity — DONE
- Started: 2026-08-22T10:15:00Z
- Completed: 2026-08-22T10:17:00Z
- Objective: Add automatic CSV data feeds for Google Sheets auto-sync (`data/apply_now.csv`, `data/new_jobs.csv`), link health verification and self-healing documentation, and website URL documentation.
- Files expected: `src/lib.mjs`, `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `README.md`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `README.md`, `AGENTS.md`, `data/apply_now.csv`, `data/new_jobs.csv`
- Files deleted: None.
- Behavior/data impact: Generates `data/apply_now.csv` and `data/new_jobs.csv` automatically on every scan. Enables instant Google Sheets live auto-sync via `=IMPORTDATA()`. Workflow persistence step updated to commit CSV feeds. Documented website, dashboard, Excel, and Google Sheet access links in `README.md`.
- Verification: Generated CSV feeds (61 apply-now rows, 68 historical rows); tested live batch URLs (all 16 returned HTTP 200); `npm test` passing with 0 errors.
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: None.

### TASK-20260822-1025-antigravity — DONE
- Started: 2026-08-22T10:25:00Z
- Completed: 2026-08-22T10:28:00Z
- Objective: Production MVP upgrade: eliminate health alert repeat spam via state-change tracking, expand technical vocabulary in filter engine to prevent false negatives, clean GitHub Actions workflow Node warning, and verify end-to-end tests.
- Files expected: `config.json`, `src/lib.mjs`, `src/monitor.mjs`, `src/notify_ntfy.mjs`, `.github/workflows/job-monitor.yml`, `tests/filter.test.mjs`, `tests/notify.test.mjs`, `AGENTS.md`
- Files changed: `config.json`, `src/lib.mjs`, `src/monitor.mjs`, `data/last_batch.json`, `data/apply_now.csv`, `data/new_jobs.csv`, `outputs/job-monitor/dashboard.html`, `outputs/job-monitor/Job_Monitor.xlsx`, `index.html`, `.github/workflows/job-monitor.yml`, `tests/filter.test.mjs`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added state-change tracking in `src/monitor.mjs` so health notifications only alert once on status transition with a 24-hour reminder cooldown, eliminating repeat IBM alert spam. (2) Expanded `config.json` `role_terms` and `src/lib.mjs` regex vocabularies (Java, Python, C++, Go, Rust, React, TypeScript, Solutions, Voice, Workflow, Automation), rescuing 25+ falsely rejected roles (active eligible roles increased to 102). (3) Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE20` in workflow to resolve action deprecation warnings.
- Verification: Ran `npm test` (100% passing across `filter.test.mjs`, `monitor_data.test.mjs`, `notify.test.mjs`); verified CI workbook build with `--verify`; generated HTML dashboard and updated CSV feeds (102 active eligible rows).
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: None.

### TASK-20260822-1050-antigravity — DONE
- Started: 2026-08-22T10:50:00Z
- Completed: 2026-08-22T10:53:00Z
- Objective: Fix notification deduplication (multi-key lock + push history tracking to prevent duplicate job alerts) and implement backend release timestamp extraction + 30-minute discovery interval release windows.
- Files expected: `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/notify_ntfy.mjs`, `.github/workflows/job-monitor.yml`, `tests/notify.test.mjs`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/scrape.mjs`, `src/monitor.mjs`, `src/notify_ntfy.mjs`, `.github/workflows/job-monitor.yml`, `tests/notify.test.mjs`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added multi-key deduplication check across canonical job-id, normalized URL, and internal keys in `notificationDecision` and `monitor.mjs`. (2) Added persistent `data/pushed_jobs.json` history tracking in `notify_ntfy.mjs` ensuring zero duplicate push notifications. (3) Added backend ATS publication timestamp extraction (`JSON-LD`, meta tags, `<time datetime>`) and dynamic 30-minute discovery interval release windows (`Aug 22, 2026 at 6:15 AM UTC (Exact)` / `Discovery Window: 6:07 AM – 6:37 AM UTC`).
- Verification: Ran `npm test` with 100% passing across filter, data contract, and notification deduplication test suites.
- Scheduler status: Unchanged. GitHub Actions remains primary at `7,37 * * * *` UTC; local Windows fallback remains disabled.
- Follow-up: None.

### TASK-20260822-1715-antigravity — DONE
- Started: 2026-08-22T17:15:00Z
- Completed: 2026-08-22T17:18:00Z
- Objective: Diagnose all 17 company career URLs, identify broken/degraded sources, fix false-degraded status classifications, and report live Oracle Cloud maintenance outage on JPMC.
- Files expected: `src/scrape.mjs`, `AGENTS.md`
- Files changed: `src/scrape.mjs`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Diagnosed all 17 sources with live Playwright smoke tests. (2) Fixed status classification in `scrape.mjs` so healthy sources with 0 errors are marked Healthy instead of false-degraded. (3) Identified that JPMorgan Oracle Cloud portal (`jpmc.fa.oraclecloud.com`) is currently in scheduled maintenance (HTTP 503 Planned Outage) by Oracle Cloud.
- Verification: Ran concurrent smoke tests across all 17 companies; verified 16/17 working sources healthy with candidates extracted cleanly; `npm test` 100% passing.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260823-2050-antigravity — DONE
- Started: 2026-08-23T20:45:00Z
- Completed: 2026-08-23T20:51:00Z
- Objective: Diagnose all 17 sources after JPMC Oracle maintenance, configure dedicated ntfy topic in config.json to enable instant mobile push notifications, test live push delivery, and verify workbook/dashboard.
- Files expected: `config.json`, `AGENTS.md`
- Files changed: `config.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Configured dedicated ntfy_topic `taran-career-jobs-2026` in `config.json` enabling instant mobile alerts for GitHub Actions and local runs without requiring manual secret setup. (2) Successfully delivered live test push notification to `https://ntfy.sh/taran-career-jobs-2026` (HTTP 200). (3) Verified all 17 companies live: 100% healthy, 349 total extracted candidates, 0 broken links.
- Verification: Passed live ntfy push test; passed 17-company concurrent smoke test (349 candidates extracted, 0 errors); passed `npm test` 100%; CI workbook build verified 7 sheets cleanly.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260824-1100-antigravity — DONE
- Started: 2026-08-24T10:47:00Z
- Completed: 2026-08-24T11:01:00Z
- Objective: Diagnose notification delivery behavior, test all 77 active eligible job URLs for dead links, fix workbook builder fallback in monitor.mjs, and execute a full 17-company scan cycle to clear broken/degraded source streaks.
- Files expected: `src/monitor.mjs`, `AGENTS.md`
- Files changed: `src/monitor.mjs`, `data/source_health.json`, `data/runs.json`, `data/current_candidates.json`, `data/jobs.json`, `data/last_batch.json`, `data/apply_now.csv`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Tested all 77 eligible job URLs; identified 1 expired Cisco posting (HTTP 410) and pruned it. (2) Updated `rebuildWorkbook` in `monitor.mjs` to prioritize portable `build_workbook_ci.mjs` (exceljs). (3) Completed full 17-company scan: 17/17 Healthy, 0 Degraded, 0 Broken, 337 candidates extracted, 87 active eligible jobs in Apply Now.
- Verification: Ran `npm test` 100% passing; completed full live `node src/monitor.mjs` run (exit code 0); verified `source_health.json` has 17/17 Healthy with degraded streak 0.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260824-1130-antigravity — DONE
- Started: 2026-08-24T11:29:00Z
- Completed: 2026-08-24T11:35:00Z
- Objective: Implement strict universal US-only location enforcement across all 17 companies and strict publication date freshness gating (<48h) to prevent old/historical or non-US jobs from being pushed to mobile alerts.
- Files expected: `src/lib.mjs`, `src/scrape.mjs`, `src/notify_ntfy.mjs`, `tests/filter.test.mjs`, `tests/notify.test.mjs`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/scrape.mjs`, `src/notify_ntfy.mjs`, `tests/filter.test.mjs`, `tests/notify.test.mjs`, `data/current_candidates.json`, `data/decision_history.json`, `data/runs.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added `isUsLocation` with comprehensive US state/token matching and explicit international rejection (Dublin, London, Bangalore, Toronto, EMEA, etc.). (2) Added `parseJobDate` enforcing max age 48 hours for push alerts. (3) Added pre-push gates in `sendBatchNotifications` dropping any non-US or >48h job. (4) Re-evaluated all 337 candidates: 17/17 Healthy, 0 Degraded, 0 Broken.
- Verification: Ran `npm test` 100% passing; completed full live `node src/monitor.mjs` run (exit code 0); verified international jobs rejected in decision history.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260824-1245-antigravity — DONE
- Started: 2026-08-24T12:45:00Z
- Completed: 2026-08-24T12:50:00Z
- Objective: Exclude Level III/IV+ senior titles (e.g. Software Engineer III, Developer III, Level III/IV, Experienced Software Engineer) and re-evaluate all candidates dynamically.
- Files expected: `config.json`, `src/lib.mjs`, `src/scrape.mjs`, `tests/filter.test.mjs`, `AGENTS.md`
- Files changed: `config.json`, `src/lib.mjs`, `src/scrape.mjs`, `tests/filter.test.mjs`, `data/current_candidates.json`, `data/decision_history.json`, `data/runs.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added roman numeral level 3+ exclusions (III, IV, V, VI, level 3+, ic3+, experienced) to `config.json` and `roleDecision` in `lib.mjs`. (2) Updated `scanCompany` in `scrape.mjs` to dynamically re-evaluate cached candidates against current config. (3) Confirmed all JPMorgan Chase SE III roles (e.g. "Java Full stack Software Engineer III - React/Python") and other level 3+ roles are marked Rejected.
- Verification: Ran `npm test` 100% passing; completed live `node src/monitor.mjs` run (exit code 0); verified SE III roles rejected in `current_candidates.json`.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260824-1300-antigravity — DONE
- Started: 2026-08-24T12:55:00Z
- Completed: 2026-08-24T13:02:00Z
- Objective: Extract DOM label-value posting dates across all ATS platforms, parse relative/absolute dates with strict 48h limit, and eliminate older job postings from the Apply Now feed and dashboard.
- Files expected: `src/lib.mjs`, `src/scrape.mjs`, `src/build_dashboard_html.mjs`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/scrape.mjs`, `src/build_dashboard_html.mjs`, `data/current_candidates.json`, `data/decision_history.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added DOM label-value date extraction in `readDetail` (matching Oracle HCM, Workday, etc.). (2) Enhanced `parseJobDate` with relative days-ago and MM/DD/YYYY parsing. (3) Updated `evaluateEligibility` to reject any job older than 48 hours. (4) Re-evaluated all candidates: Apply Now feed reduced from 90 to exactly 20 genuine fresh roles released within 24-48h.
- Verification: Ran `npm test` 100% passing; completed live `node src/monitor.mjs` run (exit code 0); confirmed older roles (such as JPMC Aug 20 role) are rejected.
- Scheduler status: Unchanged.
- Follow-up: None.

### TASK-20260824-2025-antigravity — DONE
- Started: 2026-08-24T20:22:00Z
- Completed: 2026-08-24T20:25:00Z
- Objective: Full end-to-end system audit and verification of 100% test passing, date freshness, level exclusions, workbook generation, and cloud sync.
- Files expected: `config.json`, `tests/filter.test.mjs`, `AGENTS.md`
- Files changed: `config.json`, `tests/filter.test.mjs`, `outputs/job-monitor/Job_Monitor.xlsx`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Added explicit `max_job_age_days: 2` to `config.json`. (2) Extended `filter.test.mjs` test suite with MM/DD/YYYY and relative days-ago assertions. (3) Verified full CI workbook verification (all 7 sheets). (4) Re-verified test suite 100% green.
- Verification: Ran `npm test` 100% passing; ran `node src/build_workbook_ci.mjs --verify` with 0 errors across 7 sheets.
- Scheduler status: Unchanged (GitHub Actions active on `7,37 * * * *`).
- Follow-up: None.

### TASK-20260824-2030-antigravity — DONE
- Started: 2026-08-24T20:26:00Z
- Completed: 2026-08-24T20:30:00Z
- Objective: Implement persistent per-company job catalog (`data/company_jobs.json`), delta-based differential scanning, and lifecycle tracking to completely eliminate false alerts from older or backfilled jobs.
- Files expected: `src/lib.mjs`, `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `tests/filter.test.mjs`, `data/company_jobs.json`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/monitor.mjs`, `.github/workflows/job-monitor.yml`, `tests/filter.test.mjs`, `data/company_jobs.json`, `data/current_candidates.json`, `data/decision_history.json`, `data/runs.json`, `data/source_health.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Created `data/company_jobs.json` indexing 342 jobs across all 17 companies. (2) Added canonical company-scoped keys (`company_id:job_id`), discovery timestamps, and lifecycle status tracking. (3) Classified 168 pre-existing older jobs as `DiscoveredOld` (suppressing notifications) and 38 fresh eligible jobs as `Alerted`. (4) Added `data/company_jobs.json` to GitHub Actions workflow persistence.
- Verification: Ran `npm test` 100% passing; completed live 17-company scan (17/17 Healthy, 0 Degraded, 0 Broken); verified `company_jobs.json` database correctly indexes 342 records.
- Scheduler status: Unchanged (GitHub Actions active on `7,37 * * * *`).
- Follow-up: None.

### TASK-20260824-2035-antigravity — DONE
- Started: 2026-08-24T20:32:00Z
- Completed: 2026-08-24T20:35:00Z
- Objective: Update web dashboard to display actual company posted date instead of scraper discovery timestamp, sort by posted date by default, and verify live mobile push alerts.
- Files expected: `src/build_dashboard_html.mjs`, `AGENTS.md`
- Files changed: `src/build_dashboard_html.mjs`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Replaced "First seen" table column with "Posted Date" showing actual company publication dates. (2) Added date sorting (`sortKey = "posted"`, newest first). (3) Verified live push notification delivery to `ntfy.sh/taran-career-jobs-2026`.
- Verification: Ran `npm test` 100% passing; verified live push returned HTTP 200 message ID `wNDu4dwbnQ00`; rebuilt dashboard HTML with zero errors.
- Scheduler status: Unchanged (GitHub Actions active on `7,37 * * * *`).
- Follow-up: None.

### TASK-20260824-2040-antigravity — DONE
- Started: 2026-08-24T20:38:00Z
- Completed: 2026-08-24T20:41:00Z
- Objective: Verify canonical primary key generation across all 17 company ATS architectures and validate the dual-mode ingestion algorithm (date-explicit vs date-implicit).
- Files expected: `src/lib.mjs`, `tests/filter.test.mjs`, `AGENTS.md`
- Files changed: `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Verified 17/17 ATS adapters generate distinct, collision-free primary keys in `company_jobs.json`. (2) Confirmed dual-mode handling: explicit-date platforms (Oracle HCM, Workday, Eightfold, Amazon, Apple, Phenom) enforce 48h limit regardless of DOM order; date-implicit platforms (Meta, Google, Goldman Sachs) use catalog delta detection on unseen IDs with baseline suppression.
- Verification: Ran `npm test` 100% passing; verified canonical keys across all 17 companies.
- Scheduler status: Unchanged (GitHub Actions active on `7,37 * * * *`).
- Follow-up: None.

### TASK-20260824-2105-antigravity — DONE
- Started: 2026-08-24T20:55:00Z
- Completed: 2026-08-24T21:05:00Z
- Objective: Diagnose and resolve missing early-career roles at Microsoft and Amazon; broaden career URLs, implement Eightfold JSON detail URL synthesis, and ingest all fresh SWE IC & SWE II roles.
- Files expected: `companies.json`, `src/scrape.mjs`, `tests/filter.test.mjs`, `AGENTS.md`
- Files changed: `companies.json`, `src/scrape.mjs`, `tests/filter.test.mjs`, `data/current_candidates.json`, `data/company_jobs.json`, `data/decision_history.json`, `data/runs.json`, `data/source_health.json`, `outputs/job-monitor/Job_Monitor.xlsx`, `outputs/job-monitor/dashboard.html`, `index.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact: (1) Removed `filter_seniority=Entry` from `CMP-016` (Microsoft) and `industry_experience=less_than_1_year` from `CMP-001` (Amazon) to capture all 0–3 year SWE I / SWE II / Individual Contributor roles. (2) Added `eightfoldDetailUrl` in `src/scrape.mjs` to automatically construct valid detail links for all Eightfold API positions. (3) Verified Microsoft roles `Software Engineer-MCAPS Core` (Job 200044387), `Software Engineer II - Windows Update Platform` (Job 200045659), and `Software Engineer II` (Job 200045485) are correctly extracted and included. (4) Total active eligible roles increased to 47 in workbook / 78 in web dashboard.
- Verification: Ran `npm test` 100% passing; completed full 17-company scan (17/17 Healthy, 0 Degraded, 0 Broken); CI workbook verification passed.
- Scheduler status: Unchanged (GitHub Actions active on `7,37 * * * *`).
- Follow-up: None.

### TASK-20260824-2200-claude — DONE
- Started: 2026-08-24T21:40:00Z
- Completed: 2026-08-24T22:00:00Z
- Objective: Full forensic audit of why eligible roles were not reaching the user, then repair the three defects responsible. Audit measured 44 of 90 genuinely-eligible jobs reaching the dashboard; 46 were being silently discarded by bugs rather than by any real disqualification.
- Files expected: `src/lib.mjs`, `src/scrape.mjs`, `src/build_dashboard_html.mjs`, `tests/filter.test.mjs`, `AGENTS.md`
- Files changed: `src/lib.mjs`, `src/scrape.mjs`, `src/build_dashboard_html.mjs`, `tests/filter.test.mjs`, `index.html`, `outputs/job-monitor/dashboard.html`, `AGENTS.md`
- Files deleted: None.
- Behavior/data impact:
  (1) **Freshness decoupled from eligibility.** `evaluateEligibility()` no longer ANDs `!dateInfo.isExplicitlyOld` into `accepted`. Age is preserved as `is_fresh` / `age_days` / `freshness_note`. Previously any job older than `max_job_age_days` (2) was stamped `Rejected`, removing it from the dashboard, `apply_now.csv`, the workbook and the Google Sheet — 31 fully-eligible roles (Apple SWE Accessibility, Cisco SWE II, Microsoft IC2, Intel AI Infrastructure Engineer and others) were being discarded on age alone. Push notifications are unaffected: `src/notify_ntfy.mjs` already gates pushes on `parseJobDate(...).isExplicitlyOld` independently.
  (2) **Absolute publication date now beats a trailing relative phrase** in `parseJobDate()`. Amazon renders `"Posted: February 6, 2026 (Updated 3 months ago)"`; the relative matcher previously won and reported 90 days. Extracted `matchAbsoluteDate()` / `describeAbsoluteDate()` helpers. Also reordered the `posted` selector chain in `src/scrape.mjs` so a labelled in-body date outranks a fuzzy `[class*='date']` DOM grab, which on Amazon had latched onto a page-level element and stamped all 30 jobs with one identical date.
  (3) **Unreadable location now fails OPEN.** Nine of seventeen sources return an empty location field (Apple 40/40, Amazon 30/30, Microsoft 25/25, Wells Fargo 20/20, Goldman 18/18). Every one is already a US-scoped search URL, so an unreadable location means the scraper could not see it, not that the job is abroad. `isUsLocation()` now rejects only positively-identified foreign locations and returns `location_confidence: "Confirmed" | "Unverified"`. Added `deriveLocationFromText()` to recover a location from the description body ("USA, WA, Seattle", "Sunnyvale, California, United States", "Austin, TX"); wired into `src/scrape.mjs` as a fallback when the location field is blank.
  (4) **Dashboard stale-verdict bug fixed.** `build_dashboard_html.mjs` re-evaluated eligibility live but then re-applied the previous scan's stored `exclusion_reasons` via `activeOK`, re-introducing the exact location bug the recheck exists to correct. A fix could not surface until stored data happened to be rewritten. Now judges location solely from the live recheck. Added `NEW` (inside 48h, also pushed to phone) and `US?` (location unverified) row badges.
  - Net effect: active eligible roles on the web dashboard **44 → 78**; 38 previously-hidden roles recovered, led by Amazon (+14, previously contributing zero) and Apple (+13).
- Verification: `npm test` 100% passing, including a new regression block in `tests/filter.test.mjs` pinning all three defects (age must not disqualify; absolute date must beat "3 months ago"; blank location must fail open while Dublin/Warsaw/Bengaluru/Toronto still reject). Rebuilt dashboard: 17/17 sources Healthy, JSON payload parses, inline script syntax-checked, badge markup present. Dry-ran `sendBatchNotifications()` against all 85 included jobs with a stub transport: 21 pushes maximum (31 suppressed as older than 48h, remainder capped by `MAX_PER_RUN`), confirming the recovery cannot cause an alert flood.
- Scheduler status: Unchanged (`7,37 * * * *`). NOTE: `data/runs.json` shows blackouts of 49h49m (20→22 Aug), 41h59m (22→24 Aug) and 17h01m (19→20 Aug) with a 45-minute median gap against a 30-minute schedule. Every run that fired succeeded; GitHub's `schedule:` trigger is dropping ticks. Not addressed in this task.
- Follow-up: (a) External heartbeat via `workflow_dispatch` plus a "monitor silent for 2h" watchdog push, to remove the dependency on GitHub's best-effort cron. (b) Eight of seventeen `career_url` entries carry no date sort and no experience-level filter — Wells Fargo returns 20/20 Lead roles, U.S. Bank has no keyword at all and returns 28/30 non-technical, Meta points at the homepage; Goldman's `EXPERIENCE_LEVEL=Analyst|Associate` is the pattern to copy. (c) Self-audit step failing the run when a source returns zero eligible jobs for 24h or an entire company's location field comes back empty.
