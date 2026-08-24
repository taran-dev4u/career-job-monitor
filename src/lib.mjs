import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Unique temp name per write. A fixed `${file}.tmp` is atomic for a single
  // writer but two concurrent writers to the same path clobber each other's
  // temp file mid-write and one of them renames a truncated JSON document into
  // place. Only the workflow's concurrency group prevented that, which does not
  // protect a local `--watch` run against a manual `--once` run in the same
  // checkout - a real possibility since this repo is edited by hand.
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

// Keep state.json from growing without bound.
//
// `discovered`, `evaluated` and `notified` were append-only. state.json is
// already 4.3 MB and is rewritten in full roughly every 30 minutes, so the
// repository carries a multi-megabyte diff per run forever. Entries are kept
// while the job is still live (present in `keepKeys`) or still recent; anything
// older than the retention window and no longer listed anywhere is dropped.
//
// `notified` is pruned far more conservatively than the others: forgetting that
// a job was announced is what causes a duplicate alert, so its window is long.
export function pruneState(state, keepKeys, { now = Date.now(), discoveredDays = 45, notifiedDays = 120 } = {}) {
  const keep = keepKeys instanceof Set ? keepKeys : new Set(keepKeys || []);
  const cutoff = days => now - days * 86400000;
  const stamp = entry => {
    const raw = entry && (entry.last_seen_at || entry.first_seen_at || entry.last_evaluated_at || entry.notified_at);
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const removed = { discovered: 0, evaluated: 0, notified: 0 };

  for (const [bucket, days] of [["discovered", discoveredDays], ["evaluated", discoveredDays], ["notified", notifiedDays]]) {
    const map = state[bucket];
    if (!map) continue;
    const limit = cutoff(days);
    for (const [key, entry] of Object.entries(map)) {
      if (keep.has(key)) continue;
      const t = stamp(entry);
      // An entry with no usable timestamp is kept: deleting it could re-announce
      // a job. Only demonstrably old entries are removed.
      if (t === null || t >= limit) continue;
      delete map[key];
      removed[bucket] += 1;
    }
  }
  return removed;
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
  const seniorNumeral = titleForSeniority.match(/\b(?:iii|iv|v|vi|vii)\b|\b(?:level|lvl|ic|tier|grade)\s*(?:[3-9]|iii|iv|v|vi)\b|\bexperienced\s+(?:software|developer|engineer)\b/i);
  // A title that ALSO advertises entry level is open to early-career applicants
  // even when it names a senior tier: "Entry Level & Senior Software Engineer"
  // (a real Qualcomm req, tagged Entry/Mid by Qualcomm itself) and
  // "Software Engineer (New Grad / Experienced Levels)" were both excluded.
  const entryQualifier = /\b(?:entry[ -]?level|new ?grad(?:uate)?|early career|university grad(?:uate)?|campus)\b/i.test(cleanTitle);
  const seniorTerm = entryQualifier ? "" : (seniorNumeral ? seniorNumeral[0] : (config.exclude_title_terms.find(term => tokenPresent(term, titleForSeniority)) || ""));
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
    // "About us: founded in 1998, we have 25 years of experience..." is company
    // history, not a candidate requirement. Reading it as "requires 25 years"
    // rejected the job outright.
    if (COMPANY_HISTORY_RE.test(evidence)) continue;
    // A range "2-8 years" must be judged on its UPPER bound; taking match[1]
    // reported a 2-8 year role as requiring only 2 and wrongly accepted it.
    const years = match[2] !== undefined ? Math.max(Number(match[1]), Number(match[2])) : Number(match[1]);
    const before = source.toLowerCase().slice(0, match.index);
    const inPreferredSection = Math.max(before.lastIndexOf("preferred qualifications"), before.lastIndexOf("preferred experience")) > Math.max(before.lastIndexOf("minimum qualifications"), before.lastIndexOf("required qualifications"));
    if (inPreferredSection || /preferred|ideally|desired|nice to have/i.test(evidence)) preferred.push({ years, evidence });
    else required.push({ years, evidence });
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
    // The visa/immigration/employment context is REQUIRED here, not optional.
    // With it optional, ordinary copy such as "we cannot sponsor the local
    // hackathon this year" or "unable to sponsor athletic events" matched and
    // stamped the job "Sponsorship: Not Available", dropping it outright.
    /\b(?:do not|don't|does not|doesn't|will not|won't|cannot|can't|unable to|not)\s+(?:currently\s+)?(?:be\s+)?(?:able to\s+)?(?:offer(?:ing)?|provide|providing|support(?:ing)?)?\s*(?:visa|immigration|employment|work(?:\s+visa)?|h-?1b|green card)\s*sponsor(?:ship)?\b/i,
    // ...and the bare form only when "sponsorship" (the noun) is the object,
    // which in job-posting prose is essentially always about work authorisation.
    /\b(?:do not|don't|does not|doesn't|will not|won't|cannot|can't|unable to)\s+(?:currently\s+)?(?:be\s+)?(?:able to\s+)?(?:offer(?:ing)?|provide|providing|support(?:ing)?)\s+sponsorship\b/i,
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
  // Big-tech internship postings routinely write "must be enrolled in a degree
  // program OR a recent graduate within 6 months". Matching only the enrolled
  // clause read that as student-only and rejected a graduate-eligible role.
  // If a graduate alternative appears near the match, the posting is open to
  // graduates and must not be excluded.
  // The graduate alternative can sit on either side of the enrollment clause:
  //   "enrolled in a degree program OR a recent graduate"        (or -> graduate)
  //   "must have graduated or be returning to school in the fall" (graduate -> or)
  // Require a genuine "or" disjunction so "enrolled AND graduating in 2027"
  // (student-only) is still correctly rejected.
  const graduateWindow = required
    ? source.slice(Math.max(0, required.index - 120), required.index + 220)
    : "";
  const graduateAlternative = Boolean(required) && (
    /\bor\b[^.;]{0,90}\bgraduat(?:e|ed|ing|es|ion)\b/i.test(graduateWindow) ||
    /\bgraduat(?:e|ed|ing|es|ion)\b[^.;]{0,90}\bor\b/i.test(graduateWindow)
  );
  const blocked = Boolean(required) && !graduateAlternative;
  return { accepted: !blocked, is_internship: true, status: blocked ? "Current student required" : graduateAlternative ? "Graduate eligible (enrolled OR recent graduate)" : "Graduate eligible / no current-student requirement found", evidence: required ? sentenceEvidence(source, required.index) : "No explicit current-enrollment requirement detected" };
}
export function detectJobType(text) {
  const value = clean(text).toLowerCase();
  if (/\bintern(?:ship)?\b/.test(value)) return "Internship";
  if (/\bcontract(?:or)?\b|\btemporary\b/.test(value)) return "Contract";
  if (/\bpart[ -]?time\b/.test(value)) return "Part-time";
  if (/\bfull[ -]?time\b/.test(value)) return "Full-time";
  return "Not specified";
}
// Shared US-evidence regexes. Defined once so the foreign-city guard and the
// positive US check below cannot drift apart - that drift is exactly what made
// "Birmingham, AL" resolve as non-US.
const US_COUNTRY_RE = /\b(?:united states|usa|u\.s\.a?\b|us remote|remote\s*[-–]\s*us|remote,\s*us|anywhere in the us)\b/i;
const US_STATE_ABBR_RE = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\b|;|\/|\s|$)/;
const US_STATE_NAME_RE = /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i;
// Company-history phrasing that must never be read as a candidate requirement.
const COMPANY_HISTORY_RE = /\b(?:founded|established|since \d{4}|our (?:company|firm|team)|we (?:have|bring|offer)|has (?:over|more than)|with over)\b[^.]{0,60}\b\d{1,2}\+?\s*(?:years?|yrs?)\b|\b\d{1,2}\+?\s*(?:years?|yrs?)\s+of\s+experience\s+(?:in the industry|serving|building great|delivering)/i;

export function isUsLocation(locationText = "", contextText = "") {
  const combined = clean(`${locationText} ${contextText}`).trim();
  if (!combined) return { accepted: true, is_us: null, location_confidence: "Unverified", reason: "No explicit location specified", evidence: "" };

  // Explicit international locations & countries to reject
  const nonUsCountries = [
    /\b(?:ireland|dublin|cork|galway|limerick)\b/i,
    /\b(?:united kingdom|uk\b|london|manchester|birmingham|edinburgh|belfast|cambridge,\s*uk)\b/i,
    /\b(?:india|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|chennai|noida)\b/i,
    /\b(?:canada|toronto|vancouver|montreal|ottawa|waterloo|calgary|quebec)\b/i,
    /\b(?:germany|munich|berlin|frankfurt|hamburg)\b/i,
    /\b(?:france|paris|lyon)\b/i,
    /\b(?:australia|sydney|melbourne|brisbane)\b/i,
    /\b(?:japan|tokyo|osaka)\b/i,
    /\b(?:china|beijing|shanghai|shenzhen)\b/i,
    /\b(?:singapore|israel|tel aviv|poland|warsaw|krakow|netherlands|amsterdam|switzerland|zurich|geneva|sweden|stockholm|brazil|sao paulo|mexico)\b/i,
    /\bremote\s*[-–]\s*(?:emea|apac|latam|uk|ireland|india|canada|europe|asia)\b/i
  ];

  for (const pattern of nonUsCountries) {
    if (pattern.test(combined)) {
      // Many real US cities share a name with a foreign one: Birmingham AL,
      // Manchester NH, Belfast ME, London OH, Dublin OH/CA/GA, Waterloo IA,
      // Vancouver WA, Sydney MT, Paris TX. The old guard only recognised
      // "STATE, United States" or the literal country name, so "Birmingham, AL"
      // was rejected as foreign and the job was silently dropped. Reuse the same
      // positive-US evidence used further down: a state abbreviation after a
      // comma, or a full state name, both count as explicit US evidence.
      const hasExplicitUs = US_COUNTRY_RE.test(combined) || US_STATE_ABBR_RE.test(combined) || US_STATE_NAME_RE.test(combined);

      if (!hasExplicitUs) {
        return { accepted: false, is_us: false, location_confidence: "Confirmed", reason: "Location is outside the United States", evidence: combined.slice(0, 100) };
      }
    }
  }

  // Positive US check (or US State abbreviation / Remote)
  const isUs = /\b(?:united states|usa|u\.s\.a?\b|us remote|remote\s*[-–]\s*us|remote,\s*us|anywhere in the us)\b/i.test(combined) ||
    /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\b|;|\/|\s)/i.test(combined) ||
    /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i.test(combined) ||
    /\bRemote\b/i.test(combined);

  // Fail OPEN when the location simply could not be read.
  //
  // Nine of seventeen sources return an empty location field (Apple 40/40,
  // Amazon 30/30, Microsoft 25/25, Wells Fargo 20/20, Goldman 18/18 blank).
  // Every one of those is already a US-scoped search URL, so an unreadable
  // location means "the scraper could not see it", NOT "this job is abroad".
  // Rejecting on absence discarded 15 fully-eligible US roles.
  //
  // A job is only rejected as foreign when a foreign location is positively
  // identified (the nonUsCountries loop above). Anything reaching here is
  // accepted but flagged, so the dashboard can badge it as unverified.
  if (isUs) {
    return { accepted: true, is_us: true, location_confidence: "Confirmed", reason: "US Location", evidence: combined.slice(0, 100) };
  }
  return {
    accepted: true,
    is_us: null,
    location_confidence: "Unverified",
    reason: "Location not stated by the source; no foreign location detected",
    evidence: combined.slice(0, 100)
  };
}

// Pull an absolute calendar date out of a free-form "posted" string, if one is
// present. Returns a Date or null. Shared by parseJobDate so that the same
// parsing rules apply whether the absolute date is found first or last.
function matchAbsoluteDate(cleanStr) {
  const mmddyyyy = cleanStr.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?))?\b/i);
  const isoMatch = cleanStr.match(/\b(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)\b/);
  const textDateMatch = cleanStr.match(/\b(?:posted:?\s*)?([A-Za-z]+ \d{1,2},? \d{4})\b/i);
  let dateObj = null;
  if (mmddyyyy) {
    const timePart = mmddyyyy[4] ? ` ${mmddyyyy[4]}` : "";
    dateObj = new Date(`${mmddyyyy[1]}/${mmddyyyy[2]}/${mmddyyyy[3]}${timePart}`);
  } else if (isoMatch) {
    dateObj = new Date(isoMatch[1]);
  } else if (textDateMatch) {
    dateObj = new Date(textDateMatch[1]);
  }
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  // JS Date silently rolls overflow: "02/30/2026" becomes 2 March. Verify the
  // constructed date still matches the digits that produced it.
  if (mmddyyyy) {
    const m = Number(mmddyyyy[1]), d = Number(mmddyyyy[2]);
    if (dateObj.getMonth() + 1 !== m || dateObj.getDate() !== d) return null;
  }
  // A date meaningfully in the future is a typo or a parse of the wrong field;
  // treating it as "posted today" would push a stale job as brand new.
  if (dateObj.getTime() > Date.now() + 2 * 86400000) return null;
  return dateObj;
}

function describeAbsoluteDate(dateObj, maxAgeDays) {
  const ageDays = (Date.now() - dateObj.getTime()) / 86400000;
  const isExplicitlyOld = ageDays > maxAgeDays;
  return {
    hasDate: true,
    timestamp: dateObj.getTime(),
    iso: dateObj.toISOString(),
    ageDays: Math.round(ageDays * 10) / 10,
    isRecent: !isExplicitlyOld,
    isExplicitlyOld,
    label: formatDateUtc(dateObj.toISOString())
  };
}

// Recover a location from free description text when the source did not expose a
// location field of its own. Nine of seventeen adapters return an empty
// location; their pages still almost always state the city in the body
// ("USA, WA, Seattle", "Sunnyvale, California, United States", "Austin, TX").
// Returns "" when nothing convincing is found, which leaves the caller in the
// Unverified fail-open path rather than inventing a location.
const US_STATE_ABBR = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_STATE_FULL = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming";
// A city is 1-3 capitalised words ("Austin", "San Jose", "Salt Lake City").
// Allowing free lowercase inside would let prose ("Join our team in Austin")
// bleed into the captured location.
const CITY = "[A-Z][a-z.'-]{1,18}(?: [A-Z][a-z.'-]{1,18}){0,2}";

export function deriveLocationFromText(text) {
  const t = clean(String(text || "")).slice(0, 1200);
  if (!t) return "";
  const patterns = [
    // Amazon style: "USA, WA, Seattle" / "US, CA, Sunnyvale"
    new RegExp("\\b(?:USA|US|United States)\\s*,\\s*(?:" + US_STATE_ABBR + ")\\s*,\\s*" + CITY),
    // "Sunnyvale, California, United States"
    new RegExp("\\b" + CITY + ",\\s*(?:" + US_STATE_FULL + ")(?:,\\s*United States)?\\b"),
    // "Austin, TX" / "Seattle, WA"
    new RegExp("\\b" + CITY + ",\\s*(?:" + US_STATE_ABBR + ")\\b"),
    // "Remote - US"
    /\bRemote\s*[-–]\s*(?:US|USA|United States)\b/i,
    // Bare country mention, last resort
    /\bUnited States\b/
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) return clean(match[0]);
  }
  return "";
}

export function parseJobDate(dateStr, maxAgeDays = 2) {

  if (!dateStr) return { hasDate: false, isRecent: true, isExplicitlyOld: false, ageDays: null, label: "Recently Released" };
  const cleanStr = clean(String(dateStr)).trim();

  // 0. An explicit publication date always wins over a trailing relative phrase.
  //
  // Amazon renders "Posted: February 6, 2026 (Updated 3 months ago)". The
  // relative matchers below would read "3 months ago" and mark the job 90 days
  // old, even though the string states its real publication date. The "Updated"
  // clause describes an edit, not the posting. When a string carries BOTH an
  // absolute date and a relative phrase, the absolute date is authoritative.
  const absoluteFirst = matchAbsoluteDate(cleanStr);
  if (absoluteFirst && /\b\d+\s*(?:day|week|month|year)s?\s*ago\b/i.test(cleanStr)) {
    return describeAbsoluteDate(absoluteFirst, maxAgeDays);
  }

  // 1. Relative "N days ago", "N weeks ago", "N months ago", "30+ days ago"
  const daysAgoMatch = cleanStr.match(/\b(\d+)\s*days?\s*ago\b/i);
  if (daysAgoMatch) {
    const days = Number(daysAgoMatch[1]);
    const isOld = days > maxAgeDays;
    return { hasDate: true, isRecent: !isOld, isExplicitlyOld: isOld, ageDays: days, label: cleanStr };
  }
  const weeksAgoMatch = cleanStr.match(/\b(\d+)\s*weeks?\s*ago\b/i);
  if (weeksAgoMatch) {
    const days = Number(weeksAgoMatch[1]) * 7;
    return { hasDate: true, isRecent: false, isExplicitlyOld: true, ageDays: days, label: cleanStr };
  }
  const monthsAgoMatch = cleanStr.match(/\b(\d+)\s*months?\s*ago\b/i);
  if (monthsAgoMatch) {
    const days = Number(monthsAgoMatch[1]) * 30;
    return { hasDate: true, isRecent: false, isExplicitlyOld: true, ageDays: days, label: cleanStr };
  }
  if (/\b(?:30\+|60\+|90\+)\s*days?\s*ago\b/i.test(cleanStr)) {
    return { hasDate: true, isRecent: false, isExplicitlyOld: true, ageDays: 30, label: cleanStr };
  }

  // 2. Relative fresh phrases: "Just posted", "Today", "Hours ago", "1 day ago", "Yesterday"
  if (/\b(?:just posted|today|hours? ago|minutes? ago|1 day ago|yesterday|recently)\b/i.test(cleanStr)) {
    return { hasDate: true, isRecent: true, isExplicitlyOld: false, ageDays: 0, label: cleanStr };
  }

  // 3. Absolute dates - one validated code path only.
  // This branch used to build its own Date and skip validation, so
  // "02/30/2026" silently became 2 March and a typo'd "12/31/2099" became a
  // brand-new posting. matchAbsoluteDate() rejects rolled-over and
  // far-future dates; routing through it keeps the two paths from drifting.
  const dateObj = matchAbsoluteDate(cleanStr) || (() => {
    // Do not let the permissive fallback resurrect a string matchAbsoluteDate
    // already rejected: new Date("02/30/2026") happily returns 2 March.
    if (/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(cleanStr)) return null;
    const directParse = new Date(cleanStr);
    if (isNaN(directParse.getTime()) || directParse.getFullYear() < 2020) return null;
    if (directParse.getTime() > Date.now() + 2 * 86400000) return null;
    return directParse;
  })();

  if (dateObj) return describeAbsoluteDate(dateObj, maxAgeDays);

  return { hasDate: false, isRecent: true, isExplicitlyOld: false, ageDays: null, label: cleanStr };
}

export function evaluateEligibility({ title, context = "", description = "", location = "", posted = "", config }) {
  const combined = clean(`${title} ${context} ${description} ${location}`);
  const role = roleDecision(title, combined, config);
  const experience = experienceDecision(combined, config.max_experience_years);
  const sponsorship = sponsorshipDecision(combined, config.sponsorship_policy);
  const enrollment = enrollmentDecision(title, combined);
  const locDecision = isUsLocation(location, combined);
  const dateInfo = parseJobDate(posted, config.max_job_age_days || 2);
  const reasons = [];
  if (!role.relevant) reasons.push("Not a configured technical discipline");
  if (role.seniority !== "Allowed") reasons.push(role.seniority);
  if (!experience.accepted) reasons.push(`Requires ${experience.required_years}+ years`);
  if (!sponsorship.accepted) reasons.push(sponsorship.status);
  if (!enrollment.accepted) reasons.push("Internship requires current enrollment");
  if (!locDecision.accepted) reasons.push("Location is outside the United States");
  // NOTE: age is deliberately NOT part of `accepted`.
  //
  // Eligibility answers "can I apply to this?" — discipline, seniority,
  // experience, sponsorship, enrollment, location. Freshness answers a
  // different question: "should this interrupt me with a push notification?"
  // Conflating the two meant a 3-day-old Apple SWE role was stamped Rejected
  // and vanished from the dashboard, the CSV and the workbook, as though the
  // candidate were unqualified for it. Postings stay open for weeks; 31 fully
  // eligible roles were being discarded on age alone.
  //
  // The age signal is preserved as `is_fresh` / `age_days`, and
  // src/notify_ntfy.mjs still gates PUSHES on it, so alert volume is unchanged.
  const accepted = role.accepted && experience.accepted && sponsorship.accepted && enrollment.accepted && locDecision.accepted;
  const isFresh = !dateInfo.isExplicitlyOld;
  return {
    accepted, decision: accepted ? "Included" : "Rejected", exclusion_reasons: reasons,
    is_fresh: isFresh,
    age_days: dateInfo.ageDays,
    freshness_note: isFresh ? "" : `Posted ${dateInfo.ageDays} days ago (${dateInfo.label})`,
    location_confidence: locDecision.location_confidence || "Confirmed",
    role_relevant: role.relevant, seniority: role.seniority, role_evidence: role.evidence,
    required_experience_years: experience.required_years, preferred_experience_years: experience.preferred_years,
    experience_label: experience.label, experience_evidence: experience.evidence,
    sponsorship_status: sponsorship.status, sponsorship_evidence: sponsorship.evidence,
    student_enrollment: enrollment.status, enrollment_evidence: enrollment.evidence,
    is_us_location: locDecision.is_us, location_evidence: locDecision.evidence,
    parsed_date: dateInfo,
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

export function notificationDecision(notified, recordOrKey, a3, a4, a5) {
  // Two supported call shapes:
  //   modern: (notified, record:object,  suppress:boolean, now:string)
  //   legacy: (notified, key:string,     record:object,    suppress:boolean, now:string)
  //
  // The previous dispatch read `suppress` from the 4th positional slot in BOTH
  // shapes. In the modern shape that slot holds `now` - a non-empty ISO string,
  // so `suppress` was permanently truthy. Every genuinely new eligible job took
  // the suppress branch, got stamped "notification-suppressed eligible baseline"
  // in state.notified, and the function returned false. newJobs was never
  // populated, so NO push notification could fire for any company, ever.
  // Detect the shape from the type of the second argument instead of assuming
  // a fixed arity.
  const legacy = typeof recordOrKey === "string";
  const record = legacy ? (a3 || {}) : (recordOrKey && typeof recordOrKey === "object" ? recordOrKey : {});
  const directKey = legacy ? recordOrKey : record.key;
  const suppress = legacy ? a4 : a3;
  const now = legacy ? a5 : a4;
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

export function canonicalCompanyJobKey(companyId, jobId, url = "") {
  const cid = clean(companyId || "");
  const jid = clean(jobId || extractJobId(url));
  if (cid && jid) return `${cid}:${jid.toLowerCase()}`;
  if (cid && url) return stableJobKey(cid, url);
  return "";
}

export function buildCompanyJobRecord(record, existing, now, suppress, config) {
  const key = canonicalCompanyJobKey(record.company_id, record.job_id, record.job_url || record.href);
  const parsedDate = record.parsed_date || parseJobDate(record.posted, config?.max_job_age_days || 2);
  const firstSeen = existing?.first_seen_at || record.first_seen_at || now;
  const isOldOnDiscovery = parsedDate.isExplicitlyOld;

  let notificationStatus = existing?.notification_status;
  if (!notificationStatus) {
    if (suppress) {
      notificationStatus = record.accepted ? "Baseline" : "BaselineRejected";
    } else if (isOldOnDiscovery) {
      notificationStatus = "DiscoveredOld";
    } else if (record.accepted) {
      notificationStatus = "Alerted";
    } else {
      notificationStatus = "Ineligible";
    }
  }

  return {
    key,
    company_id: record.company_id,
    company: record.company,
    job_id: record.job_id || extractJobId(record.job_url || record.href),
    title: record.title || record.role,
    location: record.location || "",
    job_url: record.job_url || record.href,
    source_url: record.source_url || "",
    job_type: record.job_type || "Not specified",
    first_seen_at: firstSeen,
    last_seen_at: now,
    published_date_raw: record.posted || "",
    published_date_iso: parsedDate.iso || "",
    age_days_at_discovery: existing?.age_days_at_discovery ?? parsedDate.ageDays,
    lifecycle_status: record.active_status === "Expired" ? "Expired" : "Active",
    notification_status: notificationStatus,
    accepted: record.accepted,
    decision: record.decision,
    exclusion_reasons: record.exclusion_reasons || [],
    required_experience_years: record.required_experience_years ?? null,
    preferred_experience_years: record.preferred_experience_years ?? null,
    experience_label: record.experience_label || "Not evaluated",
    sponsorship_status: record.sponsorship_status || "Unclear",
    student_enrollment: record.student_enrollment || "Unknown",
    is_us_location: record.is_us_location ?? null,
    description_snippet: (record.description_snippet || "").slice(0, 400)
  };
}
