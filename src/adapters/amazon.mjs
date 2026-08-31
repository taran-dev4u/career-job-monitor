import { clean, stableJobIdentityKey } from "../lib.mjs";

/**
 * Specialized Amazon Jobs Adapter
 * Used by: Amazon.com Services LLC (CMP-001)
 * 
 * Intercepts Amazon search.json payloads, extracting native id_icims, clean calendar
 * posted_date (free of trailing edit notes), structured location, and qualifications.
 */
export function extractAmazonCandidates(payloads, company) {
  const jobs = [];

  for (const p of payloads) {
    if (p.value && typeof p.value === "object") {
      const list = p.value?.jobs || [];
      if (Array.isArray(list) && list.length && list[0].id_icims) {
        for (const j of list) jobs.push(j);
      }
    }
  }

  if (!jobs.length) return null;

  const baseOrigin = "https://www.amazon.jobs";
  const candidates = [];
  const seenIds = new Set();

  for (const j of jobs) {
    const id = clean(j.id_icims);
    const title = clean(j.title);
    if (!id || !title || seenIds.has(id)) continue;
    seenIds.add(id);

    const rawPath = j.job_path || `/en/jobs/${id}`;
    const href = `${baseOrigin}${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;
    const location = clean(j.location || [j.city, j.state, j.country_code].filter(Boolean).join(", "));
    const posted = clean(j.posted_date || "");
    const context = clean(`${location} ${j.basic_qualifications || ''} ${j.description || ''}`).slice(0, 1600);
    const key = stableJobIdentityKey(company.id, id, href);

    candidates.push({
      key,
      href,
      title,
      context,
      external_id: id,
      posted,
      location,
      source: "AmazonNative"
    });
  }

  return candidates.length ? candidates : null;
}
