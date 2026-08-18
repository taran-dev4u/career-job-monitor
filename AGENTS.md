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

A job is in scope when it is related to software engineering, software development, AI, machine learning, or the configured adjacent technical disciplines; the role does not explicitly require more than three years of experience; and the posting does not explicitly deny sponsorship or OPT/CPT eligibility. Senior, staff, principal, lead, management, director, architect, and similar high-seniority roles are excluded by default. Sponsorship availability or no sponsorship mention is acceptable.

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

Last structurally verified: **2026-08-18 00:34 UTC**.

- Companies configured: **17** (`CMP-001` through `CMP-017`).
- Monitor interval: **30 minutes**.
- Windows scheduled-task name: **`Career Job Monitor - Every 30 Minutes`**.
- Baseline state: **initialized**.
- Deduplication entries at verification: **50**.
- Accepted new jobs at verification: **8**.
- Completed run records at verification: **7**.
- Sponsorship policy: prospectively reject explicit no-sponsorship/no-OPT/no-CPT postings; allow sponsorship-available and sponsorship-not-mentioned postings. Historical accepted rows predating this policy are retained.
- Generated workbook: `outputs/job-monitor/Job_Monitor.xlsx`.
- Runtime: bundled Node.js with Playwright and `@oai/artifact-tool`; `node_modules` is a local junction to the Codex bundled dependency runtime.
- Repository status: this folder is **not currently a Git repository**. Do not assume Git history, branches, or rollback are available.

The snapshot is not a live dashboard. Update it only after structural changes such as adding/removing companies, changing the scheduler, changing runtime dependencies, changing data layout, or completing a controlled re-baseline. Routine 30-minute scan results belong in the runtime logs, not here.

### Known operational limitations

- Career sites frequently change DOM markup, APIs, bot protection, and authentication behavior.
- Landing-only or heavily dynamic URLs may return zero candidates even when the company has jobs. A zero count is not proof that no jobs exist.
- Consult `data/runs.json` and `monitor.log` for current source behavior. Add a platform-specific adapter or a better filtered results URL when repeated zero counts are confirmed.
- `scripts/run_once.ps1` currently contains a machine-specific bundled Node.js path. Preserve it on this machine; make portability changes only as an explicit task.

## 4. Source-of-Truth Map

| Path | Authority and purpose | Editing rule |
|---|---|---|
| `AGENTS.md` | Canonical agent rules, project map, and agent change ledger | Every agent must read it; agents update only their own active ledger entry plus structurally affected documentation sections. |
| `README.md` | Human-facing usage and basic operating commands | Keep concise; do not duplicate the complete agent manual. |
| `companies.json` | Stable company IDs, names, and customized career URLs | Check duplicates; never reuse a retired ID. |
| `config.json` | Interval, browser limits, role terms, experience limit, and exclusions | Do not alter user criteria without authorization. |
| `data/state.json` | Baseline flag, canonical seen-job keys, and last-run state | Runtime-owned; never clear or reset casually. |
| `data/jobs.json` | Accepted newly discovered jobs | Append/deduplicate; preserve history unless deletion is explicitly requested. |
| `data/runs.json` | Monitor run history | Runtime-owned; do not manually manufacture successful runs. |
| `monitor.log` | Detailed operational output and source errors | Append-only runtime log; inspect recent lines during diagnosis. |
| `outputs/job-monitor/Job_Monitor.xlsx` | Generated user-facing workbook | Never edit manually. Correct JSON/code, then rebuild it. |
| `src/` | Scraping, filtering, deduplication, orchestration, and workbook generation | Make minimal changes and test the affected subsystem. |
| `scripts/` | One-shot runner and Windows scheduled-task management | Treat scheduler changes as operationally significant. |
| `tests/` | Filter/dedup unit checks and live source smoke test | Extend when behavior changes. |

The JSON files and application code are the editable sources of truth. The Excel workbook is always a generated projection of those sources.

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

Automatic scans update `data/state.json`, `data/jobs.json`, `data/runs.json`, `monitor.log`, and the generated workbook. Routine runs do **not** create Agent Change Ledger entries. The ledger is for agent-made changes and repairs, not job-by-job operational history.

## 7. Scheduler Safety

Expected task name: `Career Job Monitor - Every 30 Minutes`.

Use the provided scripts rather than recreating task definitions manually:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\run_once.ps1
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install_scheduled_task.ps1
powershell.exe -ExecutionPolicy Bypass -File .\scripts\uninstall_scheduled_task.ps1
```

Before a state-sensitive change, inspect task state and stop it if necessary. After maintenance, restore the requested schedule and verify the last task result. Do not report the task as healthy solely because it exists; confirm a completed run and exit code `0`.

## 8. Required Validation Matrix

Run only the checks relevant to the change, but do not skip an applicable row.

| Change | Minimum required validation |
|---|---|
| Documentation only | Verify every referenced path/command; perform the Fresh-Agent Walkthrough below. |
| Role/experience/dedup logic | `node tests/filter.test.mjs` plus representative edge cases. |
| Scraper or career URL | Filter tests plus `node tests/smoke_scraper.mjs CMP-###`; use `--details` when validating detail extraction. |
| Company addition | Duplicate/ID check, controlled baseline, job-count comparison, state preservation, workbook verification. |
| Workbook builder or data correction | Build with `node src/build_workbook.mjs --verify`, inspect values/formulas/errors, and visually review every affected sheet. |
| Scheduler scripts/settings | One manual scheduled-task run, wait for completion, confirm exit code `0`, next run time, and log/workbook update. |

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

### TASK-20260818-0520-codex — IN_PROGRESS
- Started: 2026-08-18T05:20:48Z
- Completed:
- Objective: Move unattended 30-minute monitoring to GitHub Actions so scans continue while the local computer is off, while preserving state, job history, run history, and the Excel output in a private GitHub repository.
- Files expected: `AGENTS.md`, `README.md`, `.gitignore`, `.github/workflows/job-monitor.yml`, `package.json`, `package-lock.json`, `src/monitor.mjs`, `src/build_workbook_ci.mjs`
- Files changed: Pending.
- Files deleted: None planned.
- Behavior/data impact: Add a Linux/GitHub-compatible workbook path and persistent workflow commits. Create private repository `taran-dev4u/career-job-monitor`. Disable the local Windows scheduled task only after a successful cloud run.
- Verification: Pending dependency install, unit tests, CI workbook generation, workflow syntax inspection, first GitHub Actions run, committed-state verification, and scheduler handoff.
- Scheduler status: Local task was healthy before work; it will be temporarily disabled before state-sensitive implementation and retained for rollback.
- Follow-up: Finalize after the cloud workflow succeeds.
