import { parseJobDate } from "./lib.mjs";

export const getJobPostingTimestamp = item => {
  if (!item) return 0;
  if (item.published_date_iso) {
    const t = new Date(item.published_date_iso).getTime();
    if (Number.isFinite(t) && t > 0) return t;
  }
  const rawDate = item.posted || item.published_date_raw;
  if (rawDate) {
    const parsed = parseJobDate(rawDate);
    if (parsed?.hasDate && parsed?.timestamp) return parsed.timestamp;
  }
  const fallback = item.first_seen_at || item.discovered_at;
  if (fallback) {
    const t = new Date(fallback).getTime();
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
};

export function newestFirst(items) {
  return [...items].sort((a, b) => {
    const timeA = getJobPostingTimestamp(a);
    const timeB = getJobPostingTimestamp(b);
    if (timeB !== timeA) return timeB - timeA;
    const seenA = new Date(a?.first_seen_at || a?.discovered_at || 0).getTime() || 0;
    const seenB = new Date(b?.first_seen_at || b?.discovered_at || 0).getTime() || 0;
    if (seenB !== seenA) return seenB - seenA;
    return `${a?.company || ""}|${a?.title || a?.role || ""}|${a?.job_url || ""}`.localeCompare(`${b?.company || ""}|${b?.title || b?.role || ""}|${b?.job_url || ""}`);
  });
}

