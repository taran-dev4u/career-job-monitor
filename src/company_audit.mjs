// Per-company self-audit.
//
// Every company declares what a healthy scan looks like for IT SPECIFICALLY in
// companies.json (`expects`). This module holds each source to its own contract
// and to nothing else, so a problem at one company is detected, named and
// alerted on its own terms and can never be masked by the other sixteen looking
// fine.
//
// It exists because of a class of failure the owner hit repeatedly: a source
// keeps returning HTTP 200 and a healthy-looking pile of candidates, while
// every one of them is quietly unusable. Amazon ran that way from the day it
// was added - 30 candidates a run, location blank on all 30, one shared posting
// date across every card, zero eligible jobs ever - and nothing in the pipeline
// said a word. Aggregate "17/17 Healthy" hid it completely.
//
// A finding here is a statement about ONE company, with the evidence attached.

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

// A source that scans clean but yields nothing eligible for this long is
// treated as broken rather than merely unlucky.
const ZERO_ELIGIBLE_HOURS = 24;

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/**
 * Audit a single company's scan output against its own declared expectations.
 *
 * @param {object} company  companies.json entry (may carry `expects`)
 * @param {object[]} records  this run's records for THIS company only
 * @param {object} health   this run's health row for THIS company only
 * @param {object} priorAudit  previous audit state for THIS company only
 * @param {string} runAt    ISO timestamp of this run
 * @returns {{company_id:string, company:string, findings:object[], state:object}}
 */
export function auditCompany(company, records, health, priorAudit = {}, runAt = new Date().toISOString()) {
  const expects = company.expects || {};
  const findings = [];
  const total = records.length;
  const eligible = records.filter(r => r.accepted).length;
  const add = (severity, code, message, evidence = "") =>
    findings.push({ company_id: company.id, company: company.company, severity, code, message, evidence });

  // --- the scan itself ------------------------------------------------------
  if (health?.status === "Broken") {
    add("critical", "SOURCE_BROKEN", `${company.company} failed to scan`, health.diagnostic || "");
    // Nothing below is meaningful when the scan itself failed.
    return { company_id: company.id, company: company.company, findings, state: { ...priorAudit, last_run_at: runAt } };
  }

  // --- volume ---------------------------------------------------------------
  const minCandidates = Number(expects.min_candidates ?? 1);
  if (total < minCandidates) {
    add("critical", "TOO_FEW_CANDIDATES",
      `${company.company} returned ${total} candidates, expected at least ${minCandidates}`,
      `career_url may have changed shape, or the selector/adapter no longer matches`);
  }

  // --- field extraction: the silent killers --------------------------------
  if (total > 0) {
    const blankLocation = records.filter(r => !r.location).length;
    if (expects.location && blankLocation === total) {
      add("critical", "LOCATION_EXTRACTION_DEAD",
        `${company.company}: location is blank on all ${total} candidates, but this source is expected to provide one`,
        `every job falls back to text-derived location, which is how Amazon lost 15 US roles`);
    } else if (blankLocation === total && total >= 5) {
      add("info", "LOCATION_ALWAYS_BLANK",
        `${company.company}: no candidate carries a location (expected for this source)`, "");
    }

    const dated = records.filter(r => r.posted);
    if (expects.date && dated.length === 0) {
      add("critical", "DATE_EXTRACTION_DEAD",
        `${company.company}: no candidate carries a posting date, but this source is expected to provide one`,
        `freshness cannot be judged, so nothing from this source can earn a push alert`);
    }

    // One posting date shared across many jobs means a page-level element is
    // being scraped instead of a per-job one. This is precisely the Amazon
    // "(Updated 3 months ago)" bug, generalised so it cannot recur unnoticed
    // at any source.
    if (dated.length >= 5) {
      const counts = new Map();
      for (const r of dated) counts.set(r.posted, (counts.get(r.posted) || 0) + 1);
      const [topValue, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topCount === dated.length && dated.length >= 5) {
        add("critical", "SHARED_POSTING_DATE",
          `${company.company}: all ${dated.length} dated candidates share one posting date`,
          `"${String(topValue).slice(0, 80)}" - a page-level element is being read instead of a per-job date`);
      } else if (topCount / dated.length >= 0.8 && dated.length >= 10) {
        add("warning", "MOSTLY_SHARED_POSTING_DATE",
          `${company.company}: ${pct(topCount, dated.length)}% of dated candidates share one posting date`,
          `"${String(topValue).slice(0, 80)}"`);
      }
    }
  }

  // --- yield ----------------------------------------------------------------
  // Track how long this company has gone without producing a single eligible
  // job. Some sources legitimately go quiet; a full day of clean scans with
  // zero eligible output is a broken filter or a broken search URL.
  const zeroSince = eligible > 0 ? "" : (priorAudit.zero_eligible_since || runAt);
  if (eligible === 0 && zeroSince) {
    const hours = (new Date(runAt).getTime() - new Date(zeroSince).getTime()) / 3600000;
    if (hours >= ZERO_ELIGIBLE_HOURS) {
      add("critical", "ZERO_ELIGIBLE_STREAK",
        `${company.company} has produced no eligible job for ${Math.floor(hours)}h despite scanning cleanly`,
        `${total} candidates this run; check the search URL's filters and the rejection reasons`);
    }
  }

  return {
    company_id: company.id,
    company: company.company,
    findings,
    state: {
      ...priorAudit,
      last_run_at: runAt,
      zero_eligible_since: zeroSince,
      last_eligible_at: eligible > 0 ? runAt : (priorAudit.last_eligible_at || "")
    }
  };
}

/**
 * Audit every company independently and collect the results.
 * Each company is evaluated in isolation; no company's outcome influences
 * another's verdict.
 */
export function auditAllCompanies(companies, records, health, priorState = {}, runAt = new Date().toISOString()) {
  const byCompany = new Map();
  for (const r of records) {
    if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, []);
    byCompany.get(r.company_id).push(r);
  }
  const healthById = new Map((health || []).map(h => [h.company_id, h]));

  const results = [], nextState = {};
  for (const company of companies) {
    const result = auditCompany(
      company,
      byCompany.get(company.id) || [],
      healthById.get(company.id),
      priorState[company.id] || {},
      runAt
    );
    nextState[company.id] = result.state;
    results.push(result);
  }

  const findings = results.flatMap(r => r.findings)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    run_at: runAt,
    findings,
    critical: findings.filter(f => f.severity === "critical"),
    warnings: findings.filter(f => f.severity === "warning"),
    by_company: results,
    state: nextState
  };
}

export function formatAuditReport(audit) {
  if (!audit.findings.length) return "Company self-audit: all sources meet their declared expectations.";
  const lines = [`Company self-audit: ${audit.critical.length} critical, ${audit.warnings.length} warning(s).`];
  for (const f of audit.findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.company_id} ${f.code}: ${f.message}`);
    if (f.evidence) lines.push(`      ${f.evidence}`);
  }
  return lines.join("\n");
}
