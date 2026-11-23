// Mirrors public.normalize_text / normalize_domain in SQL for in-app duplicate checks.
export function normalizeText(t?: string | null): string {
  const s = (t ?? "").toLowerCase()
    .replace(/\b(private|pvt|limited|ltd|llp|inc|the|co|company|corporation|corp)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return s;
}
export function normalizeDomain(url?: string | null): string {
  return (url ?? "").toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/[/?#:].*$/, "");
}
export function projectDedupeKey(name: string, city?: string | null) {
  return `${normalizeText(name)}|${normalizeText(city)}`;
}
/** Token-set similarity (0–1) for fuzzy duplicate warnings. */
export function similarity(a: string, b: string) {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const x of ta) if (tb.has(x)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
