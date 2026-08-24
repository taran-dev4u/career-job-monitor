import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateEligibility, roleDecision } from "./lib.mjs";

// ---------------------------------------------------------------------------
// Career Job Monitor — interactive HTML dashboard generator
//
// Reads the runtime JSON in data/ and emits a single self-contained
// dashboard.html (no external requests, no build step, opens in any browser).
// Wire it into src/monitor.mjs the same way build_workbook is invoked, or run
// standalone:  node src/build_dashboard_html.mjs [--out <file>]
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0
  ? path.resolve(args[outIndex + 1])
  : path.join(ROOT, "outputs", "job-monitor", "dashboard.html");

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
const dataPath = name => path.join(ROOT, "data", name);

// Keep only the fields the UI needs so the embedded payload stays small.
function trimCandidate(r) {
  return {
    key: r.key,
    seen: r.first_seen_at || r.discovered_at || "",
    verified: r.last_verified_at || "",
    cid: r.company_id,
    company: r.company,
    title: r.title || r.role || "",
    location: r.location || "",
    posted: r.posted || r.published_date_raw || "",
    postedIso: r.published_date_iso || "",
    url: r.job_url || "",
    active: r.active_status || "",
    decision: r.decision || "Unknown",
    reasons: Array.isArray(r.exclusion_reasons) ? r.exclusion_reasons : [],
    reqYears: r.required_experience_years ?? null,
    prefYears: r.preferred_experience_years ?? null,
    expLabel: r.experience_label || "",
    spons: r.sponsorship_status || "",
    sponsEv: r.sponsorship_evidence || "",
    roleEv: r.role_evidence || "",
    enroll: r.student_enrollment || "",
    type: r.job_type || "",
    snippet: (r.description_snippet || "").slice(0, 320)
  };
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function build() {
  const [candidates, jobs, health, runs, config, companies] = await Promise.all([
    readJson(dataPath("current_candidates.json"), []),
    readJson(dataPath("jobs.json"), []),
    readJson(dataPath("source_health.json"), []),
    readJson(dataPath("runs.json"), []),
    readJson(path.join(ROOT, "config.json"), {}),
    readJson(path.join(ROOT, "companies.json"), [])
  ]);

  // Re-evaluate role/seniority with the CURRENT (fixed) filter so the dashboard
  // reflects reality immediately, even before the next scan re-writes the JSON.
  // Experience / sponsorship / enrollment / expiry outcomes are reused from the
  // stored record (those filters are unchanged and correct).
  const maxYears = Number(config.max_experience_years ?? 3);
  const trimmed = candidates.map(r => {
    const t = trimCandidate(r);
    const recheck = evaluateEligibility({
      title: t.title,
      context: `${t.snippet} ${t.title}`,
      description: t.snippet,
      location: t.location,
      posted: t.posted,
      config
    });
    const expOK = t.reqYears == null || t.reqYears <= maxYears;
    const spOK = !(t.spons === "Not Available" || t.spons === "OPT/CPT Not Allowed");
    const enrollOK = !t.reasons.some(x => /current enrollment/i.test(x));
    // Location is judged by the LIVE recheck above, never by t.reasons.
    // t.reasons is the stored verdict from the last scan; re-reading the old
    // "outside the United States" string here re-applied the very bug the
    // recheck exists to correct, so a fix could not surface until the stored
    // data happened to be rewritten.
    const activeOK = t.active !== "Expired";
    const accepted = recheck.accepted && expOK && spOK && enrollOK && activeOK;
    // Freshness is informational now, not disqualifying: it drives the NEW
    // badge and the default newest-first sort, and gates phone pushes in
    // src/notify_ntfy.mjs - but never hides a job you can still apply to.
    t.isFresh = recheck.is_fresh !== false;
    t.ageDays = recheck.age_days ?? null;
    t.locConf = recheck.location_confidence || "Confirmed";
    const correctedDecision = accepted ? "Included"
      : t.decision === "Pending Detail" || t.decision === "Extraction Error" ? t.decision : "Rejected";
    t.recovered = accepted && r.decision !== "Included";
    t.decision = correctedDecision;
    if (!accepted) {
      t.reasons = recheck.exclusion_reasons?.length ? recheck.exclusion_reasons : t.reasons;
    } else {
      t.reasons = [];
    }
    return t;
  });

  const runAt = runs.at(-1)?.run_at || new Date().toISOString();
  const healthCounts = health.reduce((a, h) => { a[h.status] = (a[h.status] || 0) + 1; return a; }, {});
  const eligibleActive = trimmed.filter(r => r.decision === "Included" && r.active === "Active").length;
  const rejected = trimmed.filter(r => r.decision === "Rejected").length;
  const pending = trimmed.filter(r => r.decision === "Pending Detail").length;
  const recovered = trimmed.filter(r => r.recovered).length;

  // All configured companies, so a zero-candidate source is still visible.
  const healthById = new Map(health.map(h => [h.company_id, h]));
  const allCompanies = companies.map(c => ({
    id: c.id, name: c.company, url: c.career_url || "",
    status: healthById.get(c.id)?.status || "Unknown",
    candidates: healthById.get(c.id)?.candidate_count ?? 0
  }));
  const downSources = allCompanies.filter(c => c.status === "Degraded" || c.status === "Broken" || c.status === "Unknown");

  const payload = {
    generatedAt: new Date().toISOString(),
    runAt,
    recovered,
    allCompanies,
    downSources,
    candidates: trimmed,
    health: health.map(h => ({
      cid: h.company_id, company: h.company, status: h.status,
      candidates: h.candidate_count, eligible: h.eligible_count ?? 0,
      rejected: h.rejected_count ?? 0, detailErrors: h.detail_error_count ?? 0,
      zeroStreak: h.zero_streak ?? 0, lastHealthy: h.last_healthy_at || "",
      resolvedUrl: h.resolved_url || h.source_url || "", diagnostic: h.diagnostic || ""
    })),
    runs: runs.slice(-40).map(r => ({
      at: r.run_at, candidates: r.candidates_seen ?? 0, newJobs: r.new_jobs_added ?? 0,
      healthy: r.healthy_sources ?? 0, degraded: r.degraded_sources ?? 0,
      broken: r.broken_sources ?? 0, duration: r.duration_seconds ?? 0
    })),
    acceptedHistory: jobs.length,
    kpis: {
      eligibleActive, extracted: trimmed.length, rejected, pending, recovered,
      healthy: healthCounts.Healthy || 0,
      confirmedEmpty: healthCounts["Confirmed Empty"] || 0,
      degraded: healthCounts.Degraded || 0, broken: healthCounts.Broken || 0,
      companies: health.length
    }
  };

  const html = renderHtml(payload);
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, html, "utf8");
  // Also publish to the repo root as index.html so GitHub Pages serves it at a
  // clean URL (https://<user>.github.io/<repo>/). .nojekyll stops Pages from
  // running Jekyll over the file.
  await fs.writeFile(path.join(ROOT, "index.html"), html, "utf8");
  await fs.writeFile(path.join(ROOT, ".nojekyll"), "", "utf8");
  console.log(`Wrote dashboard: ${OUT} and ${path.join(ROOT, "index.html")}`);
  console.log(`  eligible-active ${eligibleActive} · extracted ${trimmed.length} · rejected ${rejected} · pending ${pending}`);
  console.log(`  sources ${payload.kpis.healthy} healthy / ${payload.kpis.degraded} degraded / ${payload.kpis.broken} broken`);
}

function renderHtml(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Career Job Monitor — Dashboard</title>
<style>
:root{
  color-scheme: light;
  --surface:#fcfcfb; --page:#f9f9f7; --card:#ffffff;
  --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --baseline:#c3c2b7; --border:rgba(11,11,11,0.10);
  --brand:#2a78d6; --brand-soft:#cde2fb;
  --good:#0ca30c; --warn:#fab219; --serious:#ec835a; --crit:#d03b3b;
  --good-ink:#006300;
}
html[data-theme="dark"]{
  color-scheme: dark;
  --surface:#1a1a19; --page:#0d0d0d; --card:#1f1f1e;
  --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --baseline:#383835; --border:rgba(255,255,255,0.10);
  --brand:#3987e5; --brand-soft:#184f95;
  --good:#0ca30c; --warn:#fab219; --serious:#ec835a; --crit:#d03b3b;
  --good-ink:#0ca30c;
}
@media (prefers-color-scheme: dark){
  html[data-theme="auto"]{
    color-scheme: dark;
    --surface:#1a1a19; --page:#0d0d0d; --card:#1f1f1e;
    --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --baseline:#383835; --border:rgba(255,255,255,0.10);
    --brand:#3987e5; --brand-soft:#184f95; --good-ink:#0ca30c;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1280px;margin:0 auto;padding:20px 20px 64px}
header.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 16px;margin-bottom:4px}
header.top h1{font-size:22px;margin:0;font-weight:650;letter-spacing:-0.01em}
.sub{color:var(--ink2);font-size:13px}
.sub b{color:var(--ink);font-weight:600}
.spacer{flex:1}
button.ghost{background:transparent;border:1px solid var(--border);color:var(--ink2);
  border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
button.ghost:hover{border-color:var(--baseline);color:var(--ink)}
.links{font-size:13px;color:var(--ink2);margin:6px 0 18px}
.links a{margin-right:14px}

/* KPI tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:20px}
.tile{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.tile .k{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.03em}
.tile .v{font-size:30px;font-weight:660;margin-top:4px;letter-spacing:-0.02em}
.tile .n{font-size:12px;color:var(--ink2);margin-top:2px}
.tile.hero{background:linear-gradient(180deg,var(--brand-soft),var(--card))}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:middle;margin-right:5px}
.d-good{background:var(--good)} .d-warn{background:var(--warn)} .d-crit{background:var(--crit)}
.d-neutral{background:var(--muted)} .d-brand{background:var(--brand)}

/* panels */
.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:20px}
.panel h2{font-size:15px;margin:0 0 12px;font-weight:640}
.grid2{display:grid;grid-template-columns:1.15fr 1fr;gap:16px}
@media (max-width:880px){.grid2{grid-template-columns:1fr}}

/* chart */
.chart{width:100%}
.chart svg{display:block;width:100%;height:auto;overflow:visible}
.axis text{fill:var(--muted);font-size:10px}
.gridline{stroke:var(--grid);stroke-width:1}
.baseline{stroke:var(--baseline);stroke-width:1}
.bar{fill:var(--brand);rx:3}
.bar:hover{fill:var(--good)}
.linepath{fill:none;stroke:var(--brand);stroke-width:2}
.legend{font-size:12px;color:var(--ink2);margin-top:6px}

/* filters */
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.filters input[type=search],.filters select{background:var(--surface);border:1px solid var(--border);
  color:var(--ink);border-radius:8px;padding:7px 10px;font-size:13px;font-family:inherit}
.filters input[type=search]{min-width:220px;flex:1}
.chk{display:inline-flex;align-items:center;gap:6px;color:var(--ink2);font-size:13px;cursor:pointer;user-select:none}
.count{color:var(--muted);font-size:12px;margin-left:auto}

html{scroll-padding-top:80px}
/* table */
.tablewrap{overflow:auto;max-height:72vh;border:1px solid var(--border);border-radius:10px;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,0.03)}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
th{position:sticky;top:0;background:var(--card);cursor:pointer;white-space:nowrap;font-weight:600;color:var(--ink2);z-index:5;box-shadow:inset 0 -1px 0 var(--border)}
th:hover{color:var(--ink)}
th .arw{color:var(--brand);font-size:11px}
tbody tr:hover{background:color-mix(in srgb,var(--brand) 6%,transparent)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.role{font-weight:560;color:var(--ink);min-width:240px}
.reasons{color:var(--ink2);font-size:12px}
.expander{cursor:pointer;color:var(--muted);font-size:11px;margin-left:6px}
.detail td{background:var(--surface);font-size:12px;color:var(--ink2)}
.detail b{color:var(--ink)}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.b-good{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good-ink)}
.b-warn{background:color-mix(in srgb,var(--warn) 22%,transparent);color:#8a6100}
.b-crit{background:color-mix(in srgb,var(--crit) 16%,transparent);color:var(--crit)}
.b-neutral{background:color-mix(in srgb,var(--muted) 18%,transparent);color:var(--ink2)}
html[data-theme="dark"] .b-warn{color:#fab219}
.applybtn{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:6px 14px;border-radius:8px;background:var(--brand);color:#fff;font-size:12px;font-weight:600;white-space:nowrap}
.applybtn:hover{text-decoration:none;filter:brightness(1.08)}

/* health */
.health-table td.st{white-space:nowrap}
.empty{color:var(--muted);padding:24px;text-align:center}
footer{color:var(--muted);font-size:12px;margin-top:28px;text-align:center}
.tooltip{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface);
  padding:6px 9px;border-radius:6px;font-size:12px;opacity:0;transition:opacity .1s;z-index:99;white-space:nowrap}
.banner{border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px;border:1px solid;display:flex;gap:10px;align-items:flex-start}
.banner.warn{background:color-mix(in srgb,var(--warn) 14%,var(--card));border-color:color-mix(in srgb,var(--warn) 45%,transparent);color:var(--ink)}
.banner.ok{background:color-mix(in srgb,var(--good) 12%,var(--card));border-color:color-mix(in srgb,var(--good) 40%,transparent);color:var(--ink)}
.banner b{font-weight:660}
.tile.rec{background:linear-gradient(180deg,color-mix(in srgb,var(--good) 18%,var(--card)),var(--card))}
.rowtag{display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;font-size:10px;font-weight:700;background:var(--good);color:#fff;vertical-align:middle}
.rowtag.tag-new{background:var(--brand)}
.rowtag.tag-loc{background:transparent;color:var(--muted);border:1px solid var(--border);font-weight:600;cursor:help}
.act{display:inline-flex;gap:6px;align-items:center}
.act button{border:1px solid var(--border);background:var(--surface);color:var(--ink2);border-radius:7px;
  padding:5px 9px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:550;white-space:nowrap}
.act button:hover{border-color:var(--baseline);color:var(--ink)}
.act button.on-applied{background:var(--good);color:#fff;border-color:transparent}
.act button.on-dismiss{background:var(--muted);color:#fff;border-color:transparent}
tr.dismissed{opacity:.45}

/* sticky nav */
.appbar{position:sticky;top:0;z-index:50;background:var(--page);
  border-bottom:1px solid var(--border);margin:-20px -20px 24px;padding:12px 20px;
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.appbar h1{font-size:18px;margin:0;font-weight:660;letter-spacing:-0.01em;white-space:nowrap}
.nav{display:flex;gap:6px;flex-wrap:wrap}
.nav a{padding:6px 14px;border-radius:999px;font-size:13px;color:var(--ink2);font-weight:550}
.nav a:hover{background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--ink);text-decoration:none}
.appbar .sub{font-size:12px;color:var(--muted)}
.appbar .spacer{flex:1}
section, details.panel{scroll-margin-top:84px}
details.panel > summary{cursor:pointer;font-size:15px;font-weight:640;list-style:none;
  display:flex;align-items:center;gap:8px;padding:2px 0}
details.panel > summary::-webkit-details-marker{display:none}
details.panel > summary::before{content:"▸";color:var(--muted);font-size:12px;transition:transform .15s}
details.panel[open] > summary::before{transform:rotate(90deg)}
details.panel > summary .cnt{font-size:12px;color:var(--muted);font-weight:500;margin-left:auto}
.linkbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.linkbar a{font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;color:var(--ink2);background:var(--card)}
.linkbar a:hover{border-color:var(--baseline);color:var(--ink);text-decoration:none}
.carlinks{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;margin-top:10px}
.carlinks a{font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;color:var(--ink2);
  background:var(--surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;gap:6px;align-items:center}
.carlinks a:hover{border-color:var(--baseline);color:var(--ink);text-decoration:none}
.carlinks .d{flex:none}
#toTop{position:fixed;right:18px;bottom:18px;z-index:30;width:42px;height:42px;border-radius:50%;
  border:1px solid var(--border);background:var(--brand);color:#fff;font-size:18px;cursor:pointer;
  opacity:0;pointer-events:none;transition:opacity .2s;box-shadow:0 2px 10px rgba(0,0,0,.2)}
#toTop.show{opacity:1;pointer-events:auto}
</style>
</head>
<body>
<div class="wrap">
  <div class="appbar">
    <h1>Career Job Monitor</h1>
    <nav class="nav">
      <a href="#jobs">Jobs</a>
      <a href="#trends">Trends</a>
      <a href="#sources">Sources</a>
      <a href="#careerpages">Career pages</a>
    </nav>
    <span class="spacer"></span>
    <span class="sub" id="updated"></span>
    <button class="ghost" id="themeBtn">◐ Theme</button>
  </div>

  <div id="banner"></div>
  <div class="tiles" id="tiles"></div>

  <div class="linkbar">
    <a href="https://github.com/taran-dev4u/career-job-monitor/actions/workflows/job-monitor.yml" target="_blank" rel="noopener">▶ Workflow runs</a>
    <a href="https://github.com/taran-dev4u/career-job-monitor/blob/main/LATEST_JOBS.md" target="_blank" rel="noopener">📄 Latest jobs (md)</a>
    <a href="https://github.com/taran-dev4u/career-job-monitor/blob/main/ALL_EXTRACTED_JOBS.md" target="_blank" rel="noopener">🗂 All extracted (md)</a>
    <a href="https://github.com/taran-dev4u/career-job-monitor/raw/main/outputs/job-monitor/Job_Monitor.xlsx" target="_blank" rel="noopener">⬇ Excel workbook</a>
    <a href="https://www.linkedin.com/jobs/" target="_blank" rel="noopener">in LinkedIn Jobs</a>
    <a href="https://github.com/taran-dev4u/career-job-monitor" target="_blank" rel="noopener">⌥ Repo</a>
  </div>

  <section id="jobs" class="panel">
    <h2>Jobs</h2>
    <div class="filters">
      <input type="search" id="q" placeholder="Search role, company, location…">
      <select id="fCompany"></select>
      <select id="fDecision">
        <option value="">All decisions</option>
        <option value="Included">Included</option>
        <option value="Rejected">Rejected</option>
        <option value="Pending Detail">Pending</option>
        <option value="Extraction Error">Extraction error</option>
      </select>
      <select id="fSpons">
        <option value="">Any sponsorship</option>
        <option value="Available">Available</option>
        <option value="Not Mentioned">Not mentioned</option>
        <option value="Unclear">Unclear</option>
        <option value="Not Available">Not available</option>
        <option value="OPT/CPT Not Allowed">No OPT/CPT</option>
      </select>
      <label class="chk"><input type="checkbox" id="fEligible"> Eligible &amp; active only</label>
      <label class="chk"><input type="checkbox" id="fRecovered"> Recovered only</label>
      <select id="fStatus">
        <option value="">Any status</option>
        <option value="applied">Applied</option>
        <option value="none">Not applied</option>
        <option value="dismissed">Dismissed</option>
      </select>
      <label class="chk"><input type="checkbox" id="fHideDismissed" checked> Hide dismissed</label>
      <span class="count" id="rowCount"></span>
    </div>
    <div class="tablewrap">
      <table id="jobsTable">
        <thead><tr id="head"></tr></thead>
        <tbody id="body"></tbody>
      </table>
    </div>
  </section>

  <details id="trends" class="panel" open>
    <summary>Trends <span class="cnt">new &amp; extracted per scan</span></summary>
    <div class="grid2" style="margin-top:12px">
      <div>
        <div class="legend" style="margin:0 0 4px">New eligible jobs per run</div>
        <div class="chart" id="chartNew"></div>
      </div>
      <div>
        <div class="legend" style="margin:0 0 4px">Jobs extracted per run</div>
        <div class="chart" id="chartExtracted"></div>
      </div>
    </div>
  </details>

  <details id="sources" class="panel">
    <summary>Source health <span class="cnt" id="srcCnt"></span></summary>
    <div class="tablewrap" style="margin-top:12px">
      <table class="health-table">
        <thead><tr>
          <th>ID</th><th>Company</th><th>Status</th><th>Cand.</th><th>Eligible</th>
          <th>Detail err</th><th>Zero streak</th><th>Diagnostic</th>
        </tr></thead>
        <tbody id="healthBody"></tbody>
      </table>
    </div>
  </details>

  <details id="careerpages" class="panel">
    <summary>Company career pages <span class="cnt" id="cpCnt"></span></summary>
    <div class="carlinks" id="carlinks"></div>
  </details>

  <footer id="foot"></footer>
</div>
<button id="toTop" title="Back to top">↑</button>
<div class="tooltip" id="tt"></div>

<script>
const DATA = ${json};
const $ = s => document.querySelector(s);
function esc(s){ return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
const tt = $("#tt");
function showTip(html, x, y){ tt.innerHTML = html; tt.style.left=(x+12)+"px"; tt.style.top=(y+12)+"px"; tt.style.opacity=1; }
function hideTip(){ tt.style.opacity=0; }

function fmtDate(iso){ if(!iso) return "—"; const d=new Date(iso); if(isNaN(d)) return iso;
  return d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
function fmtDay(iso){ if(!iso) return "—"; const d=new Date(iso); if(isNaN(d)) return iso;
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

// ---- application tracking (persists locally in this browser) ---------------
const LS_KEY = "cjm_status_v1";
let STATUS = {};
try { STATUS = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch(e){ STATUS = {}; }
function saveStatus(){ try { localStorage.setItem(LS_KEY, JSON.stringify(STATUS)); } catch(e){} }
function setStatus(key, val){ if(STATUS[key]===val) delete STATUS[key]; else STATUS[key]=val; saveStatus(); refreshTiles(); render(); }

// ---- header + tiles -------------------------------------------------------
$("#updated").innerHTML = "Updated <b>"+fmtDate(DATA.runAt)+"</b>";
const k = DATA.kpis;
function appliedCount(){ return Object.values(STATUS).filter(v=>v==="applied").length; }
function refreshTiles(){
  const tiles = [
    {k:"Eligible now", v:k.eligibleActive, n:"active accepted roles", hero:true},
    {k:"Recovered by fix", v:k.recovered, n:"were hidden — now shown", rec:true},
    {k:"Applied", v:appliedCount(), n:"you marked applied"},
    {k:"Extracted", v:k.extracted, n:"this snapshot"},
    {k:"Sources healthy", v:k.healthy+" / "+k.companies, n:(k.degraded+" degraded · "+k.broken+" broken")}
  ];
  $("#tiles").innerHTML = tiles.map(t =>
    '<div class="tile'+(t.hero?' hero':'')+(t.rec?' rec':'')+'"><div class="k">'+t.k+'</div><div class="v">'+t.v+'</div><div class="n">'+t.n+'</div></div>'
  ).join("");
}
refreshTiles();

// ---- down-source banner ---------------------------------------------------
(function(){
  const down = DATA.downSources || [];
  if(down.length){
    $("#banner").innerHTML = '<div class="banner warn">⚠️ <div><b>'+down.length+' source'+(down.length>1?'s':'')+' not returning jobs right now:</b> '+
      down.map(d=>esc(d.name)+' ('+d.status+')').join(", ")+
      '. Jobs from '+(down.length>1?'these companies':'this company')+' may be missing from this list — check '+(down.length>1?'their':'its')+' career page directly until fixed.</div></div>';
  } else {
    $("#banner").innerHTML = '<div class="banner ok">✓ <div>All '+ (DATA.allCompanies?DATA.allCompanies.length:k.companies) +' sources returned jobs on the last scan.</div></div>';
  }
})();

// ---- charts ---------------------------------------------------------------
function barChart(el, series, valKey, color){
  const W=520, H=170, padL=28, padB=26, padT=8, padR=6;
  const data = series;
  if(!data.length){ el.innerHTML='<div class="empty">No run history yet.</div>'; return; }
  const max = Math.max(1, ...data.map(d=>d[valKey]));
  const iw = W-padL-padR, ih = H-padT-padB;
  const bw = iw/data.length;
  const ticks = 3;
  let g="";
  for(let i=0;i<=ticks;i++){ const v=Math.round(max*i/ticks); const y=padT+ih-(v/max)*ih;
    g+='<line class="gridline" x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'"/>';
    g+='<text class="ax" x="'+(padL-5)+'" y="'+(y+3)+'" text-anchor="end" fill="var(--muted)" font-size="10">'+v+'</text>'; }
  let bars="";
  data.forEach((d,i)=>{
    const v=d[valKey]; const h=(v/max)*ih; const x=padL+i*bw+bw*0.16; const w=bw*0.68;
    const y=padT+ih-h;
    bars+='<rect class="bar" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" rx="3" fill="'+color+'" '+
      'data-tip="'+fmtDate(d.at)+' — '+v+'"></rect>';
  });
  // x labels: first, middle, last
  const idxs=[0,Math.floor(data.length/2),data.length-1];
  let xl="";
  idxs.forEach(i=>{ const x=padL+i*bw+bw/2; xl+='<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" fill="var(--muted)" font-size="10">'+fmtDay(data[i].at)+'</text>'; });
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img">'+g+
    '<line class="baseline" x1="'+padL+'" y1="'+(padT+ih)+'" x2="'+(W-padR)+'" y2="'+(padT+ih)+'"/>'+
    bars+xl+'</svg>';
  el.querySelectorAll(".bar").forEach(b=>{
    b.addEventListener("mousemove",e=>showTip(b.getAttribute("data-tip"),e.clientX,e.clientY));
    b.addEventListener("mouseleave",hideTip);
  });
}
function draw(){
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim()||"#2a78d6";
  barChart($("#chartNew"), DATA.runs, "newJobs", brand);
  barChart($("#chartExtracted"), DATA.runs, "candidates", brand);
}

// ---- jobs table -----------------------------------------------------------
const COLS = [
  {id:"posted", label:"Posted Date", num:false},
  {id:"company", label:"Company"},
  {id:"title", label:"Role"},
  {id:"location", label:"Location"},
  {id:"type", label:"Type"},
  {id:"reqYears", label:"Req yrs", num:true},
  {id:"spons", label:"Sponsorship"},
  {id:"decision", label:"Decision"},
  {id:"apply", label:""},
  {id:"track", label:"Track"}
];
let sortKey="posted", sortDir=-1, expanded=new Set();

function fmtPostedDate(r){
  if(r.posted && r.posted !== "Not stated" && r.posted !== "Recently Released") {
    const d = new Date(r.posted);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
      return d.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
    }
    return esc(r.posted);
  }
  if(r.seen) {
    return 'Detected ' + fmtDay(r.seen);
  }
  return "Recently Released";
}

function decBadge(d){
  const c = d==="Included"?"b-good": d==="Rejected"?"b-neutral": d==="Extraction Error"?"b-crit":"b-warn";
  return '<span class="badge '+c+'">'+d+'</span>';
}
function sponsBadge(s){
  if(!s) return '<span class="badge b-neutral">—</span>';
  const c = s==="Available"?"b-good": (s==="Not Available"||s==="OPT/CPT Not Allowed")?"b-crit": s==="Unclear"?"b-warn":"b-neutral";
  return '<span class="badge '+c+'">'+s+'</span>';
}
function companyOptions(){
  // All configured companies, with a marker when a source returned zero jobs.
  const list = (DATA.allCompanies||[]).map(c=>({name:c.name, zero:(c.candidates||0)===0}));
  const extra = [...new Set(DATA.candidates.map(c=>c.company))].filter(n=>!list.some(l=>l.name===n)).map(n=>({name:n,zero:false}));
  const all = [...list, ...extra].sort((a,b)=>a.name.localeCompare(b.name));
  $("#fCompany").innerHTML='<option value="">All companies ('+all.length+')</option>'+
    all.map(c=>'<option value="'+c.name.replace(/"/g,"&quot;")+'">'+c.name.replace(/</g,"&lt;")+(c.zero?"  ⚠ 0 jobs":"")+'</option>').join("");
}
function head(){
  $("#head").innerHTML = COLS.map(c=>{
    if(c.id==="apply") return '<th></th>';
    const arw = sortKey===c.id ? ' <span class="arw">'+(sortDir<0?"▼":"▲")+'</span>' : '';
    return '<th data-k="'+c.id+'" class="'+(c.num?'num':'')+'">'+c.label+arw+'</th>';
  }).join("");
  $("#head").querySelectorAll("th[data-k]").forEach(th=>{
    th.onclick=()=>{ const k=th.getAttribute("data-k");
      if(sortKey===k) sortDir*=-1; else { sortKey=k; sortDir=(k==="reqYears"?-1:(k==="posted"?-1:1)); }
      head(); render(); };
  });
}
function filtered(){
  const q=$("#q").value.trim().toLowerCase();
  const co=$("#fCompany").value, dec=$("#fDecision").value, sp=$("#fSpons").value;
  const elig=$("#fEligible").checked, rec=$("#fRecovered").checked;
  const st=$("#fStatus").value, hideDismissed=$("#fHideDismissed").checked;
  return DATA.candidates.filter(r=>{
    const status=STATUS[r.key]||"none";
    if(co && r.company!==co) return false;
    if(dec && r.decision!==dec) return false;
    if(sp && r.spons!==sp) return false;
    if(elig && !(r.decision==="Included" && r.active==="Active")) return false;
    if(rec && !r.recovered) return false;
    if(st && status!==st) return false;
    if(hideDismissed && !st && status==="dismissed") return false;
    if(q){ const hay=(r.title+" "+r.company+" "+r.location).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>{
    let av=a[sortKey]??"", bv=b[sortKey]??"";
    if(sortKey==="reqYears"){ av=av===null?-1:av; bv=bv===null?-1:bv; return (av-bv)*sortDir; }
    if(sortKey==="posted"){
      const aDate = new Date(a.postedIso || a.posted || a.seen).getTime() || 0;
      const bDate = new Date(b.postedIso || b.posted || b.seen).getTime() || 0;
      if (aDate !== bDate) return (aDate - bDate) * sortDir;
    }
    av=String(av).toLowerCase(); bv=String(bv).toLowerCase();
    return av<bv?-1*sortDir: av>bv?1*sortDir: 0;
  });
}
function render(){
  const rows=filtered();
  $("#rowCount").textContent=rows.length+" of "+DATA.candidates.length+" jobs";
  if(!rows.length){ $("#body").innerHTML='<tr><td colspan="10" class="empty">No jobs match these filters.</td></tr>'; return; }
  const out=[];
  for(const r of rows){
    const open=expanded.has(r.key);
    const status=STATUS[r.key]||"none";
    const recTag=r.recovered?'<span class="rowtag">RECOVERED</span>':'';
    // NEW = inside the 48h window, i.e. this one also went to your phone.
    // Everything else is still fully applyable, just not push-worthy.
    const freshTag=(r.isFresh&&r.decision==="Included")?'<span class="rowtag tag-new">NEW</span>':'';
    const locTag=(r.locConf==="Unverified"&&r.decision==="Included")?'<span class="rowtag tag-loc" title="The source did not state a location. Not rejected \u2014 this is a US-scoped search.">US?</span>':'';
    out.push('<tr class="'+(status==="dismissed"?"dismissed":"")+'">'+
      '<td class="num" title="Scanned at: '+fmtDate(r.seen)+'">'+fmtPostedDate(r)+'</td>'+
      '<td>'+esc(r.company)+'</td>'+
      '<td class="role">'+esc(r.title)+freshTag+recTag+locTag+
        '<span class="expander" data-x="'+r.key+'">'+(open?"▲ less":"▼ why")+'</span></td>'+
      '<td>'+esc(r.location||"—")+'</td>'+
      '<td>'+esc(r.type||"—")+'</td>'+
      '<td class="num">'+(r.reqYears===null?"—":r.reqYears+"+")+'</td>'+
      '<td>'+sponsBadge(r.spons)+'</td>'+
      '<td>'+decBadge(r.decision)+'</td>'+
      '<td>'+(r.url?'<a class="applybtn" href="'+esc(r.url)+'" target="_blank" rel="noopener">Open ↗</a>':'')+'</td>'+
      '<td><span class="act">'+
        '<button class="'+(status==="applied"?"on-applied":"")+'" data-s="applied" data-k="'+r.key+'">✓ Applied</button>'+
        '<button class="'+(status==="dismissed"?"on-dismiss":"")+'" data-s="dismissed" data-k="'+r.key+'">✕</button>'+
      '</span></td>'+
    '</tr>');
    if(open){
      const reasons=r.reasons.length?('<b>Reasons:</b> '+esc(r.reasons.join("; "))):'<b>Accepted.</b>';
      out.push('<tr class="detail"><td colspan="10">'+
        reasons+'<br>'+
        '<b>Experience:</b> '+esc(r.expLabel||"—")+
        ' &nbsp;·&nbsp; <b>Sponsorship:</b> '+esc(r.sponsEv||r.spons||"—")+
        (r.enroll&&r.enroll!=="Not an internship"?' &nbsp;·&nbsp; <b>Enrollment:</b> '+esc(r.enroll):'')+
        (r.posted?' &nbsp;·&nbsp; <b>Posted:</b> '+esc(r.posted):'')+
        (r.snippet?'<br><span style="color:var(--muted)">'+esc(r.snippet)+'…</span>':'')+
      '</td></tr>');
    }
  }
  $("#body").innerHTML=out.join("");
  $("#body").querySelectorAll(".expander").forEach(x=>{
    x.onclick=()=>{ const key=x.getAttribute("data-x"); expanded.has(key)?expanded.delete(key):expanded.add(key); render(); };
  });
  $("#body").querySelectorAll(".act button").forEach(btn=>{
    btn.onclick=()=>setStatus(btn.getAttribute("data-k"), btn.getAttribute("data-s"));
  });
}

// ---- source health --------------------------------------------------------
function healthRows(){
  const order={Broken:0,Degraded:1,"Confirmed Empty":2,Healthy:3};
  const rows=[...DATA.health].sort((a,b)=>(order[a.status]??9)-(order[b.status]??9)||a.cid.localeCompare(b.cid));
  $("#healthBody").innerHTML=rows.map(h=>{
    const c=h.status==="Healthy"?"d-good":h.status==="Degraded"?"d-warn":h.status==="Broken"?"d-crit":"d-neutral";
    const link=h.resolvedUrl?'<a href="'+esc(h.resolvedUrl)+'" target="_blank" rel="noopener">'+esc(h.company)+'</a>':esc(h.company);
    return '<tr><td>'+h.cid+'</td><td>'+link+'</td>'+
      '<td class="st"><span class="dot '+c+'"></span>'+h.status+'</td>'+
      '<td class="num">'+h.candidates+'</td><td class="num">'+h.eligible+'</td>'+
      '<td class="num">'+h.detailErrors+'</td><td class="num">'+h.zeroStreak+'</td>'+
      '<td class="reasons">'+esc(h.diagnostic||"")+'</td></tr>';
  }).join("");
}

// ---- theme ----------------------------------------------------------------
$("#themeBtn").onclick=()=>{
  const cur=document.documentElement.getAttribute("data-theme");
  const next=cur==="dark"?"light":cur==="light"?"auto":"dark";
  document.documentElement.setAttribute("data-theme",next);
  draw();
};

// ---- company career-page links + section counts --------------------------
function careerLinks(){
  const list=(DATA.allCompanies||[]).filter(c=>c.url);
  $("#cpCnt").textContent=list.length+" companies";
  const down=(DATA.downSources||[]).length;
  $("#srcCnt").textContent=(DATA.kpis.healthy||0)+" healthy"+(down?", "+down+" need attention":"");
  $("#carlinks").innerHTML=list.map(c=>{
    const cls=c.status==="Healthy"?"d-good":c.status==="Degraded"?"d-warn":c.status==="Broken"?"d-crit":"d-neutral";
    return '<a href="'+esc(c.url)+'" target="_blank" rel="noopener" title="'+esc(c.name)+'"><span class="dot '+cls+'"></span>'+esc(c.name)+'</a>';
  }).join("");
}

// ---- theme ----------------------------------------------------------------

// ---- boot -----------------------------------------------------------------
companyOptions(); head(); render(); healthRows(); careerLinks(); draw();
["q","fCompany","fDecision","fSpons","fEligible","fRecovered","fStatus","fHideDismissed"].forEach(id=>{
  const el=$("#"+id); el.addEventListener(id==="q"?"input":"change",render);
});
// Charts live inside the collapsible Trends panel — redraw when it opens so the
// SVG picks up a real width.
$("#trends").addEventListener("toggle",()=>{ if($("#trends").open) draw(); });
// Back-to-top button.
const toTop=$("#toTop");
toTop.onclick=()=>window.scrollTo({top:0,behavior:"smooth"});
window.addEventListener("scroll",()=>{ toTop.classList.toggle("show", window.scrollY>400); });
$("#foot").textContent="Generated "+fmtDate(DATA.generatedAt)+" · "+DATA.candidates.length+" extracted records · "+DATA.acceptedHistory+" accepted in history";
window.addEventListener("resize",()=>{ clearTimeout(window.__r); window.__r=setTimeout(draw,150); });
</script>
</body>
</html>`;
}

build().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
