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

export function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function stableJobKey(companyId, url, title = "") {
  const normalized = `${companyId}|${url.replace(/#.*$/, "").replace(/\/$/, "")}`;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export function extractJobId(url, text = "") {
  const patterns = [
    /(?:[?&]|\/)(?:job(?:id)?|req(?:uisition)?(?:id)?|position(?:id)?|pid)[=\/_-]([A-Za-z0-9-]{4,})/i,
    /\/jobs?\/([A-Za-z0-9-]{4,})(?:\/|$|\?)/i,
    /\b(?:R|REQ|JR|JOB)[-_ ]?\d{4,}\b/i
  ];
  for (const input of [url, text]) {
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return clean(match[1] || match[0]);
    }
  }
  return "";
}

export function roleLooksRelevant(title, context, config) {
  const value = ` ${clean(title)} ${clean(context)}`.toLowerCase();
  const roleHit = config.role_terms.some(term => value.includes(term.toLowerCase()));
  const excluded = config.exclude_title_terms.some(term => ` ${clean(title).toLowerCase()} `.includes(term.toLowerCase()));
  return roleHit && !excluded;
}

export function experienceDecision(text, maxYears) {
  const value = clean(text).toLowerCase();
  const patterns = [
    /(?:minimum|min\.?|at least)\s+(\d{1,2})\+?\s*(?:years?|yrs?)/gi,
    /(\d{1,2})\+\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|professional)/gi,
    /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs?)/gi,
    /(?:experience of|have)\s+(\d{1,2})\+?\s*(?:years?|yrs?)/gi
  ];
  const minimums = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) minimums.push(Number(match[1]));
  }
  if (minimums.some(years => years > maxYears)) {
    return { accepted: false, label: `${Math.max(...minimums)}+ years detected` };
  }
  if (minimums.length) return { accepted: true, label: `${Math.min(...minimums)}+ years minimum` };
  if (/new grad|new graduate|entry.level|early career|university graduate|engineer i\b|associate/.test(value)) {
    return { accepted: true, label: "Entry / early career" };
  }
  return { accepted: true, label: "No requirement above 3 years detected" };
}

export function sponsorshipDecision(text, policy = {}) {
  const value = clean(text).toLowerCase().replace(/[’]/g, "'");
  const excludeNoSponsorship = policy.exclude_explicit_no_sponsorship !== false;
  const excludeNoOptCpt = policy.exclude_explicit_no_opt_cpt !== false;

  const noSponsorshipPatterns = [
    /\bno\s+(?:visa|immigration|employment|work(?:\s+visa)?)?\s*sponsorship\b/i,
    /\bsponsorship\s+(?:is\s+)?(?:not\s+available|unavailable|not\s+offered|not\s+provided|not\s+supported)\b/i,
    /\b(?:visa|immigration|employment|work(?:\s+visa)?)\s+sponsorship\s+(?:is\s+)?(?:not\s+available|unavailable|not\s+offered|not\s+provided|not\s+supported)\b/i,
    /\b(?:this\s+)?(?:position|role|job|candidate|applicant)\s+(?:is|are)\s+not\s+eligible\s+for\b.{0,100}\bsponsorship\b/i,
    /\b(?:we|the\s+company|the\s+employer|this\s+position|this\s+role)\s+(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|cannot|can't|are\s+(?:not\s+able|unable)\s+to|is\s+(?:not\s+able|unable)\s+to)\s+(?:currently\s+)?(?:offer|provide|support)?\s*(?:visa|immigration|employment)?\s*sponsor(?:ship)?\b/i,
    /\b(?:do\s+not|don't|does\s+not|doesn't|will\s+not|won't|cannot|can't)\s+sponsor\b/i,
    /\b(?:not|never)\s+(?:currently\s+)?(?:offer(?:ing)?|provid(?:e|ing)|support(?:ing)?)\b.{0,40}\bsponsorship\b/i,
    /\b(?:will\s+not|cannot|can't)\s+(?:now\s+or\s+in\s+the\s+future\s+)?(?:offer|provide|support)\b.{0,60}\bsponsorship\b/i,
    /\bwithout\s+(?:the\s+need\s+for\s+)?(?:(?:current|now)\s+(?:or|and)\s+(?:future|in\s+the\s+future)\s+)?(?:visa|immigration|employment)?\s*sponsorship\b/i,
    /\bmust\s+not\s+(?:now\s+or\s+in\s+the\s+future\s+)?require\b.{0,60}\bsponsorship\b/i,
    /\b(?:candidates?|applicants?)\s+(?:who\s+)?(?:require|requiring|need|needing)\b.{0,60}\bsponsorship\b.{0,60}\b(?:will|are)\s+not\s+(?:be\s+)?(?:considered|eligible|accepted)\b/i,
    /\b(?:will\s+not|cannot|can't|do\s+not|don't)\s+(?:consider|accept)\b.{0,60}\b(?:candidates?|applicants?)\b.{0,60}\b(?:requiring|who\s+require|needing|who\s+need)\b.{0,60}\bsponsorship\b/i
  ];
  const noOptCptPatterns = [
    /\b(?:no|not\s+eligible\s+for|unable\s+to\s+accept|cannot\s+accept|can't\s+accept|do\s+not\s+accept)\s+(?:f-?1\s+)?(?:opt|cpt)(?:\s*(?:\/|or|and)\s*(?:opt|cpt))?\b/i,
    /\b(?:opt|cpt)(?:\s*\/\s*(?:opt|cpt))?\s+(?:candidates?|holders?|students?)\s+(?:are|will)\s+not\s+(?:eligible|considered|accepted|supported)\b/i,
    /\b(?:opt|cpt)\b.{0,50}\b(?:is|are)\s+(?:not\s+supported|not\s+eligible|unavailable)\b/i
  ];

  if (excludeNoSponsorship && noSponsorshipPatterns.some(pattern => pattern.test(value))) {
    return { accepted: false, label: "Explicit no-sponsorship restriction detected" };
  }
  if (excludeNoOptCpt && noOptCptPatterns.some(pattern => pattern.test(value))) {
    return { accepted: false, label: "Explicit OPT/CPT restriction detected" };
  }

  const sponsorshipAvailable = /\b(?:offer|provide|support)\b.{0,50}\b(?:visa|immigration|employment)?\s*sponsorship\b|\bsponsorship\s+(?:is\s+)?(?:available|offered|provided|supported)\b/i.test(value);
  return {
    accepted: true,
    label: sponsorshipAvailable ? "Sponsorship availability indicated" : "No explicit sponsorship restriction detected"
  };
}

export function compactSnippet(text, max = 420) {
  const value = clean(text);
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
