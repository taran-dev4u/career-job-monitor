import { clean, stableJobIdentityKey } from "../lib.mjs";

/**
 * Specialized Phenom People ATS Adapter
 * Used by: Cisco (CMP-012), Fidelity (CMP-005), U.S. Bank (CMP-013), Wells Fargo (CMP-014)
 * 
 * Extracts native structured job objects directly from Phenom's in-memory state
 * (window.phApp.ddo.eagerLoadRefineSearch) and intercepted /refineSearch payloads.
 */
export async function extractPhenomCandidates(page, payloads, company) {
  // 1. Try in-memory state first (fastest, most complete)
  const inMemoryJobs = await page.evaluate(() => {
    try {
      const ddo = window.phApp?.ddo;
      const data = ddo?.eagerLoadRefineSearch?.data?.jobs || 
                   ddo?.jobSearchResults?.data?.jobs || 
                   ddo?.refineSearch?.data?.jobs || [];
      return data.map(j => ({
        jobId: j.jobId || j.reqId || "",
        title: j.title || "",
        postedDate: j.postedDate || j.dateCreated || "",
        location: j.cityStateCountry || j.location || [j.city, j.state, j.country].filter(Boolean).join(", "),
        country: j.country || "",
        state: j.state || "",
        city: j.city || "",
        jobUrl: j.jobUrl || "",
        applyUrl: j.applyUrl || "",
        teaser: j.descriptionTeaser || j.ml_job_parser?.descriptionTeaser || ""
      }));
    } catch {
      return [];
    }
  }).catch(() => []);

  // 2. Also inspect intercepted network payloads for Phenom refineSearch
  const networkJobs = [];
  for (const p of payloads) {
    if (p.value && typeof p.value === "object") {
      const jobs = p.value?.data?.jobs || p.value?.jobs || [];
      if (Array.isArray(jobs) && jobs.length && (jobs[0].jobId || jobs[0].reqId)) {
        for (const j of jobs) {
          networkJobs.push({
            jobId: j.jobId || j.reqId || "",
            title: j.title || "",
            postedDate: j.postedDate || j.dateCreated || "",
            location: j.cityStateCountry || j.location || [j.city, j.state, j.country].filter(Boolean).join(", "),
            country: j.country || "",
            state: j.state || "",
            city: j.city || "",
            jobUrl: j.jobUrl || "",
            applyUrl: j.applyUrl || "",
            teaser: j.descriptionTeaser || j.ml_job_parser?.descriptionTeaser || ""
          });
        }
      }
    }
  }

  const allRaw = [...inMemoryJobs, ...networkJobs];
  if (!allRaw.length) return null; // fallback to generic if Phenom structure missing

  const candidates = [];
  const seenIds = new Set();

  for (const raw of allRaw) {
    const id = clean(raw.jobId);
    const title = clean(raw.title);
    if (!id || !title || seenIds.has(id.toLowerCase())) continue;
    seenIds.add(id.toLowerCase());

    const href = raw.jobUrl || raw.applyUrl;
    if (!href) continue;

    const loc = clean(raw.location);
    const context = clean(`${loc} Country: ${raw.country || ''} ${raw.teaser || ''}`);
    const key = stableJobIdentityKey(company.id, id, href);

    candidates.push({
      key,
      href,
      title,
      context,
      external_id: id,
      posted: raw.postedDate,
      location: loc,
      country: raw.country,
      source: "PhenomNative"
    });
  }

  return candidates.length ? candidates : null;
}
