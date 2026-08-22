# Career Job Monitor

This project checks 17 configured US career pages every 30 minutes. GitHub Actions is the always-on runner, so monitoring continues while the local computer is shut down. Open [`LATEST_JOBS.md`](LATEST_JOBS.md) for filtered eligible jobs, [`ALL_EXTRACTED_JOBS.md`](ALL_EXTRACTED_JOBS.md) for the unfiltered snapshot, or download `outputs/job-monitor/Job_Monitor.xlsx` for the full audit. All job and run views keep the newest records at the top.

## What is recorded

- `Apply Now`: currently active, eligible jobs with direct links and the evidence used to include them.
- `New Jobs`: complete history of roles first accepted after a baseline.
- `All Extracted Jobs`: the latest unfiltered snapshot, including rejected and pending jobs.
- `Decision Audit`: 30 days of inclusion/rejection decisions and matched evidence.
- `Source Health`: exactly one diagnostic row for each configured company.
- `Run Log`: scan totals plus healthy, confirmed-empty, degraded, and broken source counts.
- `Companies`: stable IDs and the exact customized career URLs supplied by the user.

The Markdown views are deliberately separate: `LATEST_JOBS.md` contains only active eligible roles, while `ALL_EXTRACTED_JOBS.md` includes every extracted role with its decision and exclusion reasons.

Job identity uses the career site's stable job or requisition ID when available, so a title or URL-slug change does not create a duplicate new-job alert. URL identity remains the fallback for sources that expose no stable ID.

The monitor opens each job-detail page before deciding eligibility. It keeps software engineering/development, AI/ML, applied technical, data/platform/infrastructure, SRE, DevOps, cloud, mobile, and related roles. Full-time, part-time, contract, and graduate-eligible internships may qualify. A role is rejected when it explicitly requires more than three years, establishes excluded senior/leadership responsibility, requires an intern to be currently enrolled, says sponsorship is unavailable, or says OPT/CPT applicants are ineligible. Experience above three years that is only preferred is displayed but does not cause rejection. Sponsorship silence and current/future sponsorship availability remain eligible.

## First run behavior

The first upgraded live run is a notification-suppressed reliability baseline. It populates the unfiltered snapshot, decisions, health data, dashboard, and workbook without announcing existing jobs. Later runs maintain separate `discovered`, `evaluated`, and `notified` state, and a previously rejected job can become newly eligible when its description changes. Never clear `data/state.json` or its existing maps merely to re-baseline or add a company; follow `AGENTS.md`.

## Commands

Run once:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\run_once.ps1
```

Install the 30-minute Windows scheduled task:

```powershell.exe -ExecutionPolicy Bypass -File .\scripts\install_scheduled_task.ps1
```

Remove it:

```powershell.exe -ExecutionPolicy Bypass -File .\scripts\uninstall_scheduled_task.ps1
```

## Mobile Push Notifications (ntfy.sh)

Get instant phone notifications whenever new eligible jobs are found without checking email or GitHub issues:

1. **Install the ntfy app** on your phone (iOS App Store or Android Google Play / F-Droid), or open [ntfy.sh](https://ntfy.sh) in your browser.
2. **Subscribe to a private topic** name (e.g. `taran-career-jobs-secret789`).
3. **Configure the topic**:
   - **In GitHub Actions**: Add a secret named `NTFY_TOPIC` with your topic name in [GitHub Repository Secrets](https://github.com/taran-dev4u/career-job-monitor/settings/secrets/actions).
   - **For local runs**: Set `"ntfy_topic": "your-secret-topic"` in `config.json` or set `$env:NTFY_TOPIC="your-secret-topic"`.
4. When a new job matching your criteria is discovered, an instant push notification is sent to your phone with direct **Apply Now** action buttons!

## Google Sheets Live Auto-Sync

You can view and track jobs directly inside **Google Sheets** on your phone, tablet, or PC without downloading files:

1. Create a new [Google Sheet](https://sheets.new).
2. In cell **`A1`**, paste this formula:
   ```text
   =IMPORTDATA("https://raw.githubusercontent.com/taran-dev4u/career-job-monitor/main/data/apply_now.csv")
   ```
3. Google Sheets will automatically import and keep the job list refreshed with direct clickable Apply URLs! You can add your own adjacent columns (e.g. *Application Status*, *Date Applied*, *Notes*).

## Access Links & Dashboards

- **Live Interactive Website:** https://taran-dev4u.github.io/career-job-monitor/
- **Filtered Eligible Jobs (Markdown):** https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md
- **All Extracted Snapshot (Markdown):** https://github.com/taran-dev4u/career-job-monitor/blob/main/ALL_EXTRACTED_JOBS.md
- **Excel 7-Sheet Workbook (.xlsx):** https://github.com/taran-dev4u/career-job-monitor/raw/main/outputs/job-monitor/Job_Monitor.xlsx
- **Live CSV Feed for Google Sheets:** https://raw.githubusercontent.com/taran-dev4u/career-job-monitor/main/data/apply_now.csv
- **Private Repository:** https://github.com/taran-dev4u/career-job-monitor
- **Workflow Runs:** https://github.com/taran-dev4u/career-job-monitor/actions/workflows/job-monitor.yml

## GitHub Actions

The workflow at `.github/workflows/job-monitor.yml` runs at minutes 7 and 37 of every UTC hour and can also be started manually from the Actions tab. It installs Chromium, runs tests, scans all sources, rebuilds and verifies the seven-sheet workbook, pushes mobile notifications via ntfy, uploads the workbook as a 30-day artifact, and commits the dashboard plus runtime JSON/CSVs/workbook back to `main`.

The workflow uses the repository-scoped `GITHUB_TOKEN` with `contents: write` and `issues: write`; no personal token or career-site credentials are stored. When new jobs are found, instant mobile push alerts are delivered via ntfy. Broken sources, or sources degraded for three consecutive runs, trigger health notifications.

GitHub schedules are best-effort and may start late during platform congestion. The local Windows task must remain disabled while the cloud workflow is active. Career sites change frequently; `Confirmed Empty` means the source explicitly reported no matches, while `Degraded` or `Broken` means zero results cannot be trusted or extraction failed. Inspect `LATEST_JOBS.md`, `Source Health`, `Decision Audit`, and `monitor.log` rather than assuming a zero count means no jobs.
