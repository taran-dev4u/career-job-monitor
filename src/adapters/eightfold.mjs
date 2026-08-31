import { clean, stableJobIdentityKey } from "../lib.mjs";

/**
 * Specialized Eightfold AI Platform Adapter
 * Used by: Qualcomm (CMP-007), Microsoft (CMP-016)
 * 
 * Intercepts Eightfold API /api/apply/v2/jobs responses and extracts exact
 * position records, millisecond timestamps (posted_ts), and canonical job links.
 */
export function extractEightfoldCandidates(payloads, company) {
  const positions = [];

  for (const p of payloads) {
    if (p.value && typeof p.value === "object") {
      const list = p.value?.positions || p.value?.data?.positions || [];
      if (Array.isArray(list) && list.length && (list[0].id || list[0].position_id)) {
        for (const pos of list) positions.push(pos);
      }
    }
  }

  if (!positions.length) return null;

  const baseOrigin = new URL(company.career_url).origin;
  const candidates = [];
  const seenIds = new Set();

  for (const pos of positions) {
    const id = String(pos.id || pos.position_id || "").trim();
    const title = clean(pos.name || pos.title || "");
    if (!id || !title || seenIds.has(id)) continue;
    seenIds.add(id);

    const href = pos.canonical_url 
      ? (pos.canonical_url.startsWith("http") ? pos.canonical_url : `${baseOrigin}${pos.canonical_url}`)
      : `${baseOrigin}/careers/job/${id}`;

    let postedIso = "";
    if (pos.posted_ts) {
      const ts = Number(pos.posted_ts);
      if (!isNaN(ts) && ts > 0) {
        // Handle seconds vs milliseconds epoch
        const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
        postedIso = new Date(ms).toISOString();
      }
    }

    const locArr = Array.isArray(pos.locations) ? pos.locations : (pos.location ? [pos.location] : []);
    const location = clean(locArr.flat().filter(Boolean).join("; "));
    const context = clean(`${location} ${pos.department || ''} ${pos.job_description || ''}`).slice(0, 1600);
    const key = stableJobIdentityKey(company.id, id, href);

    candidates.push({
      key,
      href,
      title,
      context,
      external_id: id,
      posted: postedIso || (pos.t_create ? new Date(pos.t_create).toISOString() : ""),
      location,
      source: "EightfoldNative"
    });
  }

  return candidates.length ? candidates : null;
}
