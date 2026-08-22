import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}
export async function writeCsvAtomic(file, rows, headers) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const esc = val => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const headerLine = headers.map(h => esc(h.label || h.key || h)).join(",");
  const lines = rows.map(r => headers.map(h => esc(typeof h.get === "function" ? h.get(r) : r[h.key || h])).join(","));
  const content = [headerLine, ...lines].join("\n") + "\n";
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, content, "utf8");
  await fs.rename(temp, file);
}
export function clean(value = "") { return String(value).replace(/\s+/g, " ").trim(); }
export function hashText(value = "") { return crypto.createHash("sha256").update(clean(value)).digest("hex"); }
export function stableJobKey(companyId, url) {
  const normalized = `${companyId}|${String(url).replace(/#.*$/, "").replace(/\/$/, "")}`;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}
export function stableJobIdentityKey(companyId, jobId, url) {
  const identity = clean(jobId) ? `job-id:${clean(jobId).toLowerCase()}` : url;
  return stableJobKey(companyId, identity);
}
export function extractJobId(url, text = "") {
  const patterns = [
    /\b((?:REQ|JR|JOB)[-_ ]?\d{4,})\b/i,
    /\/details\/([A-Za-z0-9_-]{4,})(?:\/|$|\?)/i,
    /\/roles?\/([A-Za-z0-9_-]{4,})(?:\/|$|\?|#)/i,          // higher.gs.com/roles/176741
    /(?:[?&]|\/)(?:job(?:id)?|req(?:uisition)?(?:id)?|position(?:id)?|posting(?:id)?|gh_jid|pid|id)[=\/_-]([A-Za-z0-9-]{4,})/i,
    /\/(?:job|jobs|position|posting|opening|vacancy|careers?)\/[^?#]*?((?:REQ|JR|R)?[-_]?\d{4,})(?:\/|$|\?|#)/i,
    /\/(\d{6,})(?:[/?#-]|$)/                                 // trailing numeric ID in the path
  ];
  for (const input of [url, text]) for (const pattern of patterns) {
    const match = String(input).match(pattern);
    if (match) return clean(match[1] || match[0]);
  }
  return "";
}

// A term is present as a whole token if it is bounded by non-letters on both
// sides. This stops "architect" from matching inside "architecture" and
// "lead" from matching "leading"/"leader"/"leadership".
function tokenPresent(term, text) {
  const t = String(term).trim().replace(/[.,]+$/, "").toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
}

// Generic recall net: a title that names an engineering/dev/science ROLE in a
// SOFTWARE/AI/DATA context, and is not in an explicitly non-software domain.
// Recall is prioritised over precision on purpose — a false accept is a visible
// extra row; a false reject silently loses a job.
const ROLE_WORD = /(?:^|[^a-z])(engineer|engineering|developer|development|programmer|programming|sde|sdet|scientist|specialist|analyst|technical staff|technologist|member of technical staff)(?:[^a-z]|$)/i;
const TECH_DOMAIN = /(?:^|[^a-z])(software|ml|ai|machine learning|deep learning|artificial intelligence|data|database|backend|back-end|front-end|frontend|full[- ]?stack|cloud|aws|azure|gcp|devops|devsecops|sre|site reliability|platform|infrastructure|systems?|embedded|firmware|compiler|security|infosec|cybersecurity|network|distributed|mobile|ios|android|web|computer vision|nlp|robotics|application|applied|research|quantitative|quant|solutions?|integrations?|voice|telecom|workflow|graph|analytics|bi|etl|pipeline|automation|fusion|java|python|c\+\+|golang|go|rust|javascript|typescript|react|node|sql|nosql|api|microservices|fintech|algorithm|computational)(?:[^a-z]|$)/i;
const NON_SOFTWARE_DOMAIN = /(?:^|[^a-z])(electrical(?!\s+and\s+computer)|mechanical|optical|photonics|hardware|chemical|biomedical|bioinformatics|civil|materials|thermal|antenna|acoustic|packaging|manufacturing|fabrication|facilities|account executive|marketing|recruit|talent|payroll|logistics|supply chain|construction|nurse|clinical|mortgage|wealth management|banker|accountant)(?:[^a-z]|$)/i;

export function roleDecision(title, context, config) {
  const cleanTitle = clean(title).toLowerCase();
  const padded = ` ${cleanTitle} `;
  // 1. Configured allow-list (gives a precise evidence term), else generic net.
  const listTerm = config.role_terms.find(term => padded.includes(term.toLowerCase())) || "";
  const generic = ROLE_WORD.test(cleanTitle) && TECH_DOMAIN.test(cleanTitle) && !NON_SOFTWARE_DOMAIN.test(cleanTitle);
  const relevant = Boolean(listTerm) || generic;
  const roleTerm = listTerm || (generic ? "technical engineering/developer role" : "");
  // 2. Seniority is judged from the TITLE ONLY (never the description body),
  //    with whole-token matching. Senior/staff/principal/lead/manager in a job
  //    TITLE reliably signals seniority; in the body it is just noise.
  //    "Member of Technical Staff" is an IC title, not a "Staff" seniority level.
  const titleForSeniority = cleanTitle.replace(/technical staff/g, "technical role");
  const seniorTerm = config.exclude_title_terms.find(term => tokenPresent(term, titleForSeniority)) || "";
  return {
    accepted: relevant && !seniorTerm,
    relevant,
    seniority: seniorTerm ? `Excluded: ${seniorTerm.trim()}` : "Allowed",
    evidence: seniorTerm ? seniorTerm.trim() : roleTerm || "No configured technical role term"
  };
}
export function roleLooksRelevant(title, context, config) { return roleDecision(title, context, config).accepted; }

function sentenceEvidence(text, index, length = 220) {
  const value = clean(text);
  const separator = value.lastIndexOf(". ", index);
  const start = separator < 0 ? 0 : separator + 2;
  const endAt = value.indexOf(". ", index + 1);
  return value.slice(start, endAt < 0 ? start + length : Math.min(endAt + 1, start + length));
}

export function experienceDecision(text, maxYears) {
  const source = clean(text);
  const requiredPatterns = [
    /(?:minimum|min\.?|at least|required|requires?|must have|need(?:s|ed)?|possess(?:es)?|have)\s+(?:of\s+)?(\d{1,2})\+?\s*(?:years?|yrs?)/gi,
    /(\d{1,2})\+\s*(?:years?|yrs?)(?:\s+of)?\s+(?:required|professional|industry|work|experience)/gi,
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s+of\s+(?:(?:professional|industry|work|software|engineering|development|programming|relevant)\s+){0,3}experience/gi,
    /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs?)(?![^.]{0,70}\bpreferred\b)/gi
  ];
  const preferredPatterns = [
    /(?:preferred|ideally|desired|nice to have)[^.;]{0,80}?(\d{1,2})\+?\s*(?:years?|yrs?)/gi,
    /(\d{1,2})\+?\s*(?:years?|yrs?)[^.;]{0,50}\b(?:preferred|desired)\b/gi
  ];
  const required = [], preferred = [];
  for (const pattern of preferredPatterns) for (const match of source.matchAll(pattern)) preferred.push({ years: Number(match[1]), evidence: sentenceEvidence(source, match.index) });
  for (const pattern of requiredPatterns) for (const match of source.matchAll(pattern)) {
    const evidence = sentenceEvidence(source, match.index);
    const before = source.toLowerCase().slice(0, match.index);
    const inPreferredSection = Math.max(before.lastIndexOf("preferred qualifications"), before.lastIndexOf("preferred experience")) > Math.max(before.lastIndexOf("minimum qualifications"), before.lastIndexOf("required qualifications"));
    if (inPreferredSection || /preferred|ideally|desired|nice to have/i.test(evidence)) preferred.push({ years: Number(match[1]), evidence });
    else required.push({ years: Number(match[1]), evidence });
  }
  const requiredYears = required.length ? Math.max(...required.map(x => x.years)) : null;
  const preferredYears = preferred.length ? Math.max(...preferred.map(x => x.years)) : null;
  const entry = /new grad|new graduate|entry[ -]?level|early career|university graduate|engineer i\b|associate/i.test(source);
  return {
    accepted: requiredYears === null || requiredYears <= maxYears,
    required_years: requiredYears,
    preferred_years: preferredYears,
    label: requiredYears !== null ? `${requiredYears}+ years required` : entry ? "Entry / early career" : `No required experience above ${maxYears} years detected`,
    evidence: required[0]?.evidence || preferred[0]?.evidence || (entry ? "Entry / early-career language detected" : "No explicit required-years statement detected")
  };
}

export function sponsorshipDecision(text, policy = {}) {
  const source = clean(text).replace(/[’]/g, "'");
  const noOpt = [/\bno\s+(?:f-?1\s+)?(?:opt|cpt)(?:\s*(?:\/|or|and)\s*(?:opt|cpt))?\b/i, /\b(?:opt|cpt)\b.{0,70}\b(?:not eligible|not supported|not accepted|cannot accept|unable to accept|will not be considered)\b/i];
  const noSponsor = [
    /\bno\s+(?:visa|immigration|employment|work(?:\s+visa)?)?\s*sponsorship\b/i,
    /\bsponsorship\s+(?:is\s+)?(?:not available|unavailable|not offered|not provided|not supported)\b/i,
    /\bnot eligible for\b.{0,100}\bsponsorship\b/i,
    /\b(?:do not|don't|does not|doesn't|will not|won't|cannot|can't|unable to|not)\s+(?:currently\s+)?(?:be\s+)?(?:able to\s+)?(?:offer(?:ing)?|provide|providing|support(?:ing)?)?\s*(?:visa|immigration|employment)?\s*sponsor(?:ship)?\b/i,
    /\bwithout\s+(?:the need for\s+)?(?:(?:current|now)\s+(?:or|and)\s+(?:future|in the future)\s+)?(?:visa|immigration|employment)?\s*sponsorship\b/i,
    /\b(?:must not|will not)\s+(?:now or in the future\s+)?require\b.{0,60}\bsponsorship\b/i,
    /\b(?:candidates?|applicants?)\b.{0,45}\b(?:requiring|who require|needing|who need)\b.{0,60}\bsponsorship\b.{0,60}\b(?:not considered|not eligible|not accepted|will not be considered)\b/i,
    /\bnot\s+providing\s+(?:visa|immigration|employment)?\s*sponsorship\b/i
  ];
  const available = /\b(?:offer|provide|support)\b.{0,50}\b(?:visa|immigration|employment)?\s*sponsorship\b|\bsponsorship\s+(?:is\s+)?(?:available|offered|provided|supported)\b|\bfuture sponsorship may be available\b/i;
  const find = patterns => patterns.map(pattern => ({ match: pattern.exec(source) })).find(item => item.match);
  const optHit = policy.exclude_explicit_no_opt_cpt === false ? null : find(noOpt);
  const sponsorHit = policy.exclude_explicit_no_sponsorship === false ? null : find(noSponsor);
  const availableHit = available.exec(source);
  if (optHit) return { accepted: false, status: "OPT/CPT Not Allowed", label: "Explicit OPT/CPT restriction detected", evidence: sentenceEvidence(source, optHit.match.index) };
  if (sponsorHit) return { accepted: false, status: "Not Available", label: "Explicit no-sponsorship restriction detected", evidence: sentenceEvidence(source, sponsorHit.match.index) };
  if (availableHit) return { accepted: true, status: "Available", label: "Sponsorship availability indicated", evidence: sentenceEvidence(source, availableHit.index) };
  const mentioned = /sponsor(?:ship)?|\bf-?1\s+opt\b|\b(?:opt|cpt)\s+(?:candidate|student|holder)|work authorization/i.exec(source);
  return { accepted: true, status: mentioned ? "Unclear" : "Not Mentioned", label: mentioned ? "Sponsorship language is inconclusive" : "Sponsorship not mentioned", evidence: mentioned ? sentenceEvidence(source, mentioned.index) : "No sponsorship restriction found" };
}

export function enrollmentDecision(title, text) {
  const internship = /\bintern(?:ship)?\b/i.test(title);
  if (!internship) return { accepted: true, is_internship: false, status: "Not an internship", evidence: "" };
  const source = clean(text);
  const required = /(?:currently|actively)\s+(?:enrolled|pursuing)|must\s+be\s+enrolled|return(?:ing)?\s+to\s+(?:school|university|college)|continuing\s+(?:their|your)\s+education/i.exec(source);
  return { accepted: !required, is_internship: true, status: required ? "Current student required" : "Graduate eligible / no current-student requirement found", evidence: required ? sentenceEvidence(source, required.index) : "No explicit current-enrollment requirement detected" };
}
export function detectJobType(text) {
  const value = clean(text).toLowerCase();
  if (/\bintern(?:ship)?\b/.test(value)) return "Internship";
  if (/\bcontract(?:or)?\b|\btemporary\b/.test(value)) return "Contract";
  if (/\bpart[ -]?time\b/.test(value)) return "Part-time";
  if (/\bfull[ -]?time\b/.test(value)) return "Full-time";
  return "Not specified";
}
export function evaluateEligibility({ title, context = "", description = "", config }) {
  const combined = clean(`${title} ${context} ${description}`);
  const role = roleDecision(title, combined, config);
  const experience = experienceDecision(combined, config.max_experience_years);
  const sponsorship = sponsorshipDecision(combined, config.sponsorship_policy);
  const enrollment = enrollmentDecision(title, combined);
  const reasons = [];
  if (!role.relevant) reasons.push("Not a configured technical discipline");
  if (role.seniority !== "Allowed") reasons.push(role.seniority);
  if (!experience.accepted) reasons.push(`Requires ${experience.required_years}+ years`);
  if (!sponsorship.accepted) reasons.push(sponsorship.status);
  if (!enrollment.accepted) reasons.push("Internship requires current enrollment");
  const accepted = role.accepted && experience.accepted && sponsorship.accepted && enrollment.accepted;
  return {
    accepted, decision: accepted ? "Included" : "Rejected", exclusion_reasons: reasons,
    role_relevant: role.relevant, seniority: role.seniority, role_evidence: role.evidence,
    required_experience_years: experience.required_years, preferred_experience_years: experience.preferred_years,
    experience_label: experience.label, experience_evidence: experience.evidence,
    sponsorship_status: sponsorship.status, sponsorship_evidence: sponsorship.evidence,
    student_enrollment: enrollment.status, enrollment_evidence: enrollment.evidence,
    job_type: detectJobType(combined)
  };
}
export function formatTimeUtc(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC", hour12: true });
  } catch { return ""; }
}

export function formatDateUtc(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch { return ""; }
}

export function formatScanIntervalWindow(startIso, endIso) {
  const startD = startIso ? new Date(startIso) : null;
  const endD = endIso ? new Date(endIso) : new Date();
  const startTime = startD && !isNaN(startD.getTime())
    ? startD.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC", hour12: true })
    : "";
  const endTime = endD && !isNaN(endD.getTime())
    ? endD.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC", hour12: true })
    : "";
  if (startTime && endTime) return `${startTime} – ${endTime} UTC`;
  if (endTime) return `Around ${endTime} UTC`;
  return "Current 30-min scan interval";
}

export function formatReleaseTimeline(rawPosted, discoveredAt, windowStart) {
  const cleanPosted = clean(rawPosted);
  let parsedDate = null;
  if (cleanPosted && !/not stated|recently/i.test(cleanPosted)) {
    const d = new Date(cleanPosted);
    if (!isNaN(d.getTime())) parsedDate = d;
  }
  
  const intervalWindow = formatScanIntervalWindow(windowStart, discoveredAt);

  if (parsedDate) {
    const hasSpecificTime = /T\d{2}:\d{2}/.test(cleanPosted) || /:\d{2}/.test(cleanPosted);
    const dateStr = formatDateUtc(parsedDate);
    const timeStr = formatTimeUtc(parsedDate);
    const exactLabel = hasSpecificTime && timeStr ? `${dateStr} at ${timeStr} UTC (Exact ATS timestamp)` : dateStr;
    return {
      posted_display: exactLabel,
      discovery_window: intervalWindow,
      is_exact: hasSpecificTime
    };
  }

  return {
    posted_display: cleanPosted && !/not stated/i.test(cleanPosted) ? cleanPosted : "Recently Released",
    discovery_window: intervalWindow,
    is_exact: false
  };
}

export function compactSnippet(text, max = 900) { const value = clean(text); return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
export function isOlderThan(iso, milliseconds) { return !iso || Date.now() - new Date(iso).getTime() >= milliseconds; }

export function getJobIdentityKeys(companyId, jobId, url, existingKey) {
  const keys = new Set();
  if (existingKey) keys.add(existingKey);
  if (companyId && url) keys.add(stableJobKey(companyId, url));
  if (companyId && jobId) keys.add(stableJobIdentityKey(companyId, jobId, url));
  return [...keys];
}

export function markBaselinePending(notified, key, now) {
  notified[key] ||= { notified_at: now, reason: "baseline pending first evaluation" };
}

export function notificationDecision(notified, recordOrKey, extraRecord, suppress, now) {
  // Support both (notified, record, suppress, now) and legacy (notified, key, record, suppress, now)
  const record = (typeof recordOrKey === "object" && recordOrKey !== null) ? recordOrKey : (extraRecord || {});
  const directKey = typeof recordOrKey === "string" ? recordOrKey : record.key;
  const keys = getJobIdentityKeys(record.company_id, record.job_id, record.job_url || record.href, directKey);
  const marker = keys.map(k => notified[k]).find(Boolean);

  if (marker?.reason === "baseline pending first evaluation") {
    for (const k of keys) {
      if (record.accepted) notified[k] = { notified_at: now, reason: "baseline eligible after pending evaluation" };
      else delete notified[k];
    }
    return false;
  }
  if (suppress) {
    if (record.accepted && !marker) {
      for (const k of keys) notified[k] = { notified_at: now, reason: "notification-suppressed eligible baseline" };
    }
    return false;
  }
  if (record.accepted && !marker) {
    for (const k of keys) notified[k] = { notified_at: now, reason: "new eligible job" };
    return true;
  }
  return false;
}
