import { clean, stableJobIdentityKey, extractJobId } from "../lib.mjs";

/**
 * Specialized Workday CXS Adapter
 * Used by: Intel (CMP-009)
 * 
 * Intercepts Workday CXS REST API (/wday/cxs/...) responses and extracts
 * structured job postings, exact requisition numbers, locationsText, and postedOn.
 */
export function extractWorkdayCandidates(payloads, company) {
  const postings = [];

  for (const p of payloads) {
    if (p.value && typeof p.value === "object") {
      const list = p.value?.jobPostings || [];
      if (Array.isArray(list) && list.length && list[0].externalPath) {
        for (const post of list) postings.push(post);
      }
    }
  }

  if (!postings.length) return null;

  const baseOrigin = new URL(company.career_url).origin;
  const candidates = [];
  const seenPaths = new Set();

  for (const post of postings) {
    const rawPath = post.externalPath || "";
    if (!rawPath || seenPaths.has(rawPath.toLowerCase())) continue;
    seenPaths.add(rawPath.toLowerCase());

    const title = clean(post.title || "");
    if (!title) continue;

    // Normalise Workday URL with canonical site path (e.g. /en-US/External/job/...)
    let href = `${baseOrigin}${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;
    const parsed = new URL(href);
    if (parsed.pathname.startsWith("/job/")) {
      parsed.pathname = `/en-US/External${parsed.pathname}`;
      href = parsed.href;
    }

    const id = clean(post.bulletFields?.[0] || extractJobId(href, title));
    const location = clean(post.locationsText || "");
    const posted = clean(post.postedOn || "");
    const context = clean(`${location} ${posted} ${title}`);
    const key = stableJobIdentityKey(company.id, id, href);

    candidates.push({
      key,
      href,
      title,
      context,
      external_id: id,
      posted,
      location,
      source: "WorkdayNative"
    });
  }

  return candidates.length ? candidates : null;
}
