import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRawHtml } from "./fetchPage";
import { webSearch } from "./integrations/search";

/**
 * Free company-level contact finder: reads the company's own website (home page +
 * contact page) and pulls the emails and phone numbers printed there.
 * Nothing is guessed: every value comes from a public page, and its URL is returned.
 */
export interface FoundContacts { website: string | null; emails: string[]; phones: string[]; sourceUrl: string | null }

const SKIP_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email)\.|^(noreply|no-reply|donotreply)@/i;
const DIRECTORY = /(linkedin|facebook|instagram|twitter|youtube|wikipedia|justdial|indiamart|zaubacorp|tofler|glassdoor|naukri|ambitionbox)\./i;

export function extractEmails(html: string, domain?: string): string[] {
  const found = new Set<string>();
  const decoded = html.replace(/&#64;|\[at\]|\(at\)/gi, "@").replace(/&#46;|\[dot\]|\(dot\)/gi, ".");
  for (const m of decoded.matchAll(/mailto:([^"'?>\s]+)/gi)) { try { found.add(decodeURIComponent(m[1]).toLowerCase()); } catch { /* bad encoding */ } }
  for (const m of decoded.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) found.add(m[0].toLowerCase());
  const own = (e: string) => Number(!!domain && e.endsWith(domain));
  return [...found].filter((e) => !SKIP_EMAIL.test(e) && e.length < 80).sort((a, b) => own(b) - own(a)).slice(0, 5);
}

function normPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+91")) d = d.slice(3); else if (d.startsWith("0091")) d = d.slice(4); else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (/^1800\d{6,7}$/.test(d)) return d;                                       // toll-free
  if (d.startsWith("0")) d = d.slice(1);
  if (/^[6-9]\d{9}$/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;    // mobile
  if (/^[1-9]\d{9}$/.test(d)) return `+91 ${d}`;                              // landline with STD code
  return null;
}

export function extractPhones(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/tel:([+\d\s().-]{8,20})/gi)) { const n = normPhone(m[1]); if (n) found.add(n); }
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(/(?:\+91[\s-]?|0091[\s-]?|\b0)?(?:\d[\s-]?){9}\d\b|\b1800[\s-]?\d{3}[\s-]?\d{3,4}\b/g)) { const n = normPhone(m[0]); if (n) found.add(n); }
  return [...found].slice(0, 4);
}

function contactLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const origin = new URL(base).origin;
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    if (!/contact|reach|enquir|connect|office|locat/i.test(`${m[1]} ${m[2]}`)) continue;
    try { const u = new URL(m[1], base); if (u.origin === origin) out.add(u.toString()); } catch { /* bad link */ }
  }
  for (const p of ["/contact-us", "/contact", "/contactus"]) out.add(origin + p);
  return [...out].slice(0, 4);
}

const hostOf = (u: string) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return null; } };

/** Finds the company website with one search, when we do not have it yet. */
export async function findWebsite(company: string, city?: string | null): Promise<string | null> {
  const { hits } = await webSearch(`${company} ${city ?? ""} official website contact`.replace(/\s+/g, " ").trim(), { num: 5, minResults: 1 });
  const h = hits.find((x) => !DIRECTORY.test(x.url));
  return h ? new URL(h.url).origin : null;
}

export async function findCompanyContacts(website: string): Promise<FoundContacts> {
  const host = hostOf(website);
  if (!host) return { website: null, emails: [], phones: [], sourceUrl: null };
  const home = `https://${host}`;
  const emails: string[] = []; const phones: string[] = []; let sourceUrl: string | null = null;
  const take = (html: string, url: string) => {
    const e = extractEmails(html, host); const p = extractPhones(html);
    if ((e.length || p.length) && !sourceUrl) sourceUrl = url;
    for (const x of e) if (!emails.includes(x)) emails.push(x);
    for (const x of p) if (!phones.includes(x)) phones.push(x);
  };
  let homePage: { finalUrl: string; html: string } | null = null;
  try { homePage = await fetchRawHtml(home); } catch { /* unreachable */ }
  if (homePage) take(homePage.html, homePage.finalUrl);
  for (const link of contactLinks(homePage?.html ?? "", homePage?.finalUrl ?? home)) {
    if (emails.length && phones.length) break;
    try { const r = await fetchRawHtml(link); if (r) take(r.html, r.finalUrl); } catch { /* skip */ }
  }
  return { website: homePage ? new URL(homePage.finalUrl).origin : home, emails: emails.slice(0, 5), phones: phones.slice(0, 4), sourceUrl };
}

/** Fills a company's empty website / official email / official phone from its own website. Never overwrites. */
export async function enrichCompany(db: SupabaseClient, companyId: string, opts: { searchIfNoWebsite?: boolean } = {}): Promise<FoundContacts | null> {
  const { data: c } = await db.from("companies").select("id,name,website,city,official_email,official_phone").eq("id", companyId).single();
  if (!c) return null;
  let website = c.website as string | null;
  if (!website && opts.searchIfNoWebsite) website = await findWebsite(c.name as string, c.city as string | null).catch(() => null);
  if (!website) return { website: null, emails: [], phones: [], sourceUrl: null };
  const found = await findCompanyContacts(website);
  const patch: Record<string, string> = {};
  if (!c.website && found.website) patch.website = found.website;
  if (!c.official_email && found.emails[0]) patch.official_email = found.emails[0];
  if (!c.official_phone && found.phones[0]) patch.official_phone = found.phones.slice(0, 2).join(", ").slice(0, 40);
  if (Object.keys(patch).length) await db.from("companies").update(patch).eq("id", companyId);
  if (found.sourceUrl) await db.from("lead_sources").insert({ company_id: companyId, url: found.sourceUrl, title: "Company website (contact details)", source_type: "web" }).then(() => null, () => null);
  return found;
}
