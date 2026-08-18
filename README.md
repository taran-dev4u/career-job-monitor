# Career Job Monitor

This project checks the 17 configured career pages every 30 minutes and keeps a single Excel workbook at `outputs/job-monitor/Job_Monitor.xlsx`. GitHub Actions is the intended always-on runner, so monitoring continues while the local computer is shut down.

## What is recorded

- `Companies`: stable company ID, company name, and the exact customized career URL supplied.
- `New Jobs`: only newly discovered matching jobs after the first baseline run.
- `Run Log`: scan timestamp, counts, errors, and duration. A zero-result scan does not add a row to `New Jobs`.

The filter keeps US/remote software engineering, software development, AI, ML, data/platform/backend/frontend/full-stack, SRE, DevOps, cloud, mobile, and application-development roles. Titles such as senior, staff, principal, lead, manager, director, and architect are excluded. A description is rejected when it explicitly requires more than three years of experience. It is also rejected when the posting explicitly says sponsorship is unavailable or that OPT/CPT candidates are not eligible. Jobs remain eligible when sponsorship is available or the posting does not mention sponsorship.

## First run behavior

The first live run is a baseline. Existing matching links are marked as seen but are not added to `New Jobs`. Later runs append only unseen jobs. To intentionally treat the next run as a new baseline, stop the scheduled task and change `data/state.json` to `{ "initialized": false, "seen": {} }`.

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

The workflow at `.github/workflows/job-monitor.yml` runs at minutes 7 and 37 of every UTC hour and can also be started manually from the Actions tab. It installs Chromium, runs unit tests, scans all sources, rebuilds the workbook with the portable CI builder, uploads the workbook as a 30-day workflow artifact, and commits updated state/job/run JSON plus the workbook back to the default branch.

The workflow uses repository-scoped `GITHUB_TOKEN` access with `contents: write`; no personal token or career-site credentials are stored. GitHub schedules are best-effort and may start late during platform congestion. The local Windows scheduled task should remain disabled while the GitHub workflow is active to avoid two independent monitors.

The browser runs headlessly. Errors from individual company pages are logged to `monitor.log` and do not stop the remaining companies. Career sites change their markup and bot protection periodically; inspect `Run Log`/`monitor.log` if a source repeatedly returns zero candidates or errors.
