const timestamp = value => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstTimestamp = (item, fields) => {
  for (const field of fields) {
    const value = timestamp(item?.[field]);
    if (value) return value;
  }
  return 0;
};

export function newestFirst(items, primaryFields = ["first_seen_at", "discovered_at"], secondaryFields = ["posted", "last_verified_at"]) {
  return [...items].sort((a, b) => {
    const primary = firstTimestamp(b, primaryFields) - firstTimestamp(a, primaryFields);
    if (primary) return primary;
    const secondary = firstTimestamp(b, secondaryFields) - firstTimestamp(a, secondaryFields);
    if (secondary) return secondary;
    return `${a?.company || ""}|${a?.title || a?.role || ""}|${a?.job_url || ""}`.localeCompare(`${b?.company || ""}|${b?.title || b?.role || ""}|${b?.job_url || ""}`);
  });
}
