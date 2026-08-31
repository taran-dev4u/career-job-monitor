import { clean, stableJobIdentityKey } from "../lib.mjs";

/**
 * Specialized Oracle Cloud HCM (Candidate Experience) Adapter
 * Used by: JPMorgan Chase (CMP-008), Oracle America (CMP-010)
 * 
 * Intercepts recruitingCEJobRequisitions REST payloads, extracts exact Requisition Ids,
 * PostingDates, and builds verified canonical trailing-slash detail URLs.
 */
export function extractOracleHcmCandidates(payloads, company) {
  const items = [];

  for (const p of payloads) {
    if (p.value && typeof p.value === "object") {
      const list = p.value?.items || [];
      if (Array.isArray(list) && list.length && (list[0].Id || list[0].id)) {
        for (const item of list) items.push(item);
      }
    }
  }

  if (!items.length) return null;

  const oracleDetailUrl = id => {
    if (/jpmc\.fa\.oraclecloud\.com/i.test(company.career_url)) {
      return `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${id}/`;
    }
    if (/careers\.oracle\.com/i.test(company.career_url)) {
      return `https://careers.oracle.com/en/sites/jobsearch/job/${id}/`;
    }
    return "";
  };

  const candidates = [];
  const seenIds = new Set();

  for (const item of items) {
    const id = String(item.Id || item.id || "").trim();
    const title = clean(item.Title || item.title || "");
    if (!id || !title || seenIds.has(id)) continue;
    seenIds.add(id);

    const href = oracleDetailUrl(id);
    if (!href) continue;

    const location = clean(item.PrimaryLocation || item.primaryLocation || item.location || "");
    const posted = clean(item.PostingDate || item.postingDate || "");
    const context = clean(`${location} ${item.ShortDescriptionStr || item.shortDescription || ''}`).slice(0, 1600);
    const key = stableJobIdentityKey(company.id, id, href);

    candidates.push({
      key,
      href,
      title,
      context,
      external_id: id,
      posted,
      location,
      source: "OracleHcmNative"
    });
  }

  return candidates.length ? candidates : null;
}
