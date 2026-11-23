// Anti-fabrication checks applied to every AI extraction. Pure functions (unit tested).
// Rule: a field survives only if the source text actually supports it.

export function norm(s: string) {
  return s.toLowerCase().replace(/[“”"’‘'`]/g, "").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
}
export function textContains(text: string, needle?: string | null) {
  if (!needle) return false;
  const n = norm(needle); if (n.length < 3) return false;
  return norm(text).includes(n);
}
/** Quote is grounded if ≥ 85% of its 3-word shingles occur in the text (tolerates minor whitespace/punctuation drift). */
export function quoteGrounded(text: string, quote?: string | null) {
  if (!quote) return false;
  if (textContains(text, quote)) return true;
  const t = norm(text); const words = norm(quote).split(" ").filter(Boolean);
  if (words.length < 5) return false;
  let hit = 0, total = 0;
  for (let i = 0; i + 3 <= words.length; i++) { total++; if (t.includes(words.slice(i, i + 3).join(" "))) hit++; }
  return total > 0 && hit / total >= 0.85;
}
export function nameGrounded(text: string, name?: string | null) {
  if (!name) return false;
  if (textContains(text, name)) return true;
  // allow "Rahul K. Sharma" vs "Rahul Sharma": every token of ≥3 letters must be present
  const toks = norm(name).split(/[^a-z]+/).filter((x) => x.length >= 3);
  const t = norm(text);
  return toks.length >= 2 && toks.every((x) => new RegExp(`\\b${x}\\b`).test(t));
}
export function emailGrounded(text: string, email?: string | null) {
  if (!email) return false;
  return text.toLowerCase().includes(email.toLowerCase().trim());
}
export function phoneGrounded(text: string, phone?: string | null) {
  if (!phone) return false;
  const d = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  if (d.length < 8) return false;
  return text.replace(/\D/g, "").includes(d);
}
const REQUIREMENT_WORDS = /\b(tender|tenders|contractor|contractors|vendor|vendors|rfq|rfp|eoi|expression of interest|bid|bids|bidders|empanel\w*|quotation|quotations|invit\w+|appoint\w*|seeking|required|requirement|procure\w*)\b/i;
export function confirmsRequirement(quote: string) { return REQUIREMENT_WORDS.test(quote); }

export function monetaryGrounded(text: string) { return /(₹|\brs\.?|\binr\b|crore|\bcr\b|lakh|million|billion)/i.test(text); }
export function areaGrounded(text: string) { return /(sq\.?\s?ft|sqft|square f(ee|oo)t|sq\.?\s?m\b|square met|acre)/i.test(text); }
export function yearGrounded(text: string, date?: string | null) {
  if (!date) return false;
  const y = date.slice(0, 4);
  return /^\d{4}$/.test(y) && text.includes(y);
}

export type OppClass = "CONFIRMED_REQUIREMENT" | "POTENTIAL_OPPORTUNITY" | "UNVERIFIED_ANNOUNCEMENT";

export interface RawContact { name: string | null; designation: string | null; company: string | null; email: string | null; phone: string | null; linkedin_url: string | null }

export interface GroundingReport { notes: string[] }

/** Returns the corrected opportunity class and a list of notes explaining any downgrade. */
export function groundClassification(text: string, cls: OppClass, quote: string | null, notes: string[]): OppClass {
  if (!quoteGrounded(text, quote)) {
    if (cls !== "UNVERIFIED_ANNOUNCEMENT") notes.push("Evidence quote not found verbatim in the source — classification downgraded to Unverified announcement.");
    return "UNVERIFIED_ANNOUNCEMENT";
  }
  if (cls === "CONFIRMED_REQUIREMENT" && !confirmsRequirement(quote!)) {
    notes.push("Evidence does not explicitly mention a tender/contractor/vendor requirement — downgraded to Potential opportunity.");
    return "POTENTIAL_OPPORTUNITY";
  }
  return cls;
}

export function groundContacts(text: string, contacts: RawContact[], notes: string[]) {
  const out: RawContact[] = [];
  for (const c of contacts) {
    if (!c.name || !nameGrounded(text, c.name)) { if (c.name) notes.push(`Dropped contact “${c.name}” — name not present in source.`); continue; }
    const email = c.email && emailGrounded(text, c.email) ? c.email.trim().toLowerCase() : null;
    if (c.email && !email) notes.push(`Removed email for ${c.name} — not present in source text.`);
    const phone = c.phone && phoneGrounded(text, c.phone) ? c.phone.trim() : null;
    if (c.phone && !phone) notes.push(`Removed phone for ${c.name} — not present in source text.`);
    const linkedin = c.linkedin_url && /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(c.linkedin_url) && text.includes(c.linkedin_url.replace(/^https?:\/\//, "").split("?")[0].slice(0, 30)) ? c.linkedin_url : null;
    const designation = c.designation && textContains(text, c.designation) ? c.designation : c.designation && nameGrounded(text, c.designation) ? c.designation : null;
    out.push({ ...c, email, phone, linkedin_url: linkedin, designation });
  }
  return out;
}
