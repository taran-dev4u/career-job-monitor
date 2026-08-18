# Career Job Monitor

This project checks 17 configured US career pages every 30 minutes. GitHub Actions is the always-on runner, so monitoring continues while the local computer is shut down. Open [`LATEST_JOBS.md`](LATEST_JOBS.md) for the quickest view of verified matches and source health, or download `outputs/job-monitor/Job_Monitor.xlsx` for the full audit.

## What is recorded

- `Apply Now`: currently active, eligible jobs with direct links and the evidence used to include them.
- `New Jobs`: complete history of roles first accepted after a baseline.
- `All Extracted Jobs`: the latest unfiltered snapshot, including rejected and pending jobs.
- `Decision Audit`: 30 days of inclusion/rejection decisions and matched evidence.
- `Source Health`: exactly one diagnostic row for each configured company.
- `Run Log`: scan totals plus healthy, confirmed-empty, degraded, and broken source counts.
- `Companies`: stable IDs and the exact customized career URLs supplied by the user.

The monitor opens each job-detail page before deciding eligibility. It keeps software engineering/development, AI/ML, applied technical, data/platform/infrastructure, SRE, DevOps, cloud, mobile, and related roles. Full-time, part-time, contract, and graduate-eligible internships may qualify. A role is rejected when it explicitly requires more than three years, establishes excluded senior/leadership responsibility, requires an intern to be currently enrolled, says sponsorship is unavailable, or says OPT/CPT applicants are ineligible. Experience above three years that is only preferred is displayed but does not cause rejection. Sponsorship silence and current/future sponsorship availability remain eligible.

## First run behavior

The first upgraded live run is a notification-suppressed reliability baseline. It populates the unfiltered snapshot, decisions, health data, dashboard, and workbook without announcing existing jobs. Later runs maintain separate `discovered`, `evaluated`, and `notified` state, and a previously rejected job can become newly eligible when its description changes. Never clear `data/state.json` or its existing maps merely to re-baseline or add a company; follow `AGENTS.md`.

## Commands

Run once:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\run_once.ps1
```

Install the 30-minute Windows scheduled task:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install_scheduled_task.ps1
```

Remove it:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\uninstall_scheduled_task.ps1
```

## GitHub Actions

The workflow at `.github/workflows/job-monitor.yml` runs at minutes 7 and 37 of every UTC hour and can also be started manually from the Actions tab. It installs Chromium, runs tests, scans all sources, rebuilds and verifies the seven-sheet workbook, publishes GitHub issues, uploads the workbook as a 30-day artifact, and commits the dashboard plus runtime JSON/workbook back to `main`.

- Private repository: https://github.com/taran-dev4u/career-job-monitor
- Latest jobs: https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md
- Workflow runs: https://github.com/taran-dev4u/career-job-monitor/actions/workflows/job-monitor.yml
- Alerts: https://github.com/taran-dev4u/career-job-monitor/issues

The workflow uses the repository-scoped `GITHUB_TOKEN` with `contents: write` and `issues: write`; no personal token or career-site credentials are stored. A non-empty batch creates a `[New Jobs]` issue with direct Apply links and mentions `@taran-dev4u`. Broken sources, or sources degraded for three consecutive runs, create one deduplicated `source-health` issue which closes automatically after recovery. No new-job issue is created for an empty batch.

GitHub schedules are best-effort and may start late during platform congestion. The local Windows task must remain disabled while the cloud workflow is active. Career sites change frequently; `Confirmed Empty` means the source explicitly reported no matches, while `Degraded` or `Broken` means zero results cannot be trusted or extraction failed. Inspect `LATEST_JOBS.md`, `Source Health`, `Decision Audit`, and `monitor.log` rather than assuming a zero count means no jobs.
