import "server-only";
import { HttpError } from "../api";
import { assertWithinBudget, getCredentials, providerFetch, recordUsage, SEARCH_PROVIDERS, type ProviderId } from "./registry";
import { createAdminClient } from "../supabase/admin";

export interface SearchHit { title: string; url: string; snippet: string; date?: string; source?: string; provider: ProviderId }
export type Freshness = "7d" | "30d" | "90d" | "6m" | "12m" | "upcoming12m" | undefined;
export interface SearchOpts { num?: number; freshness?: Freshness; news?: boolean; jobId?: string; userId?: string }

type Adapter = (q: string, creds: Record<string, string>, o: SearchOpts) => Promise<SearchHit[]>;

const serper: Adapter = async (q, c, o) => {
  const tbs = { "7d": "qdr:w", "30d": "qdr:m", "90d": "qdr:m3", "6m": "qdr:m6", "12m": "qdr:y", upcoming12m: "qdr:y" }[o.freshness ?? "12m"];
  const j = (await providerFetch("serper", `https://google.serper.dev/${o.news ? "news" : "search"}`, {
    method: "POST", headers: { "X-API-KEY": c.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: "in", hl: "en", num: o.num ?? 10, ...(tbs ? { tbs } : {}) }),
  })) as { organic?: Array<Record<string, string>>; news?: Array<Record<string, string>> };
  return (o.news ? j.news : j.organic)?.map((r) => ({ title: r.title, url: r.link, snippet: r.snippet ?? "", date: r.date, source: r.source, provider: "serper" as const })) ?? [];
};

const ADAPTERS: Record<string, Adapter> = { serper };

export async function searchProviderOrder(): Promise<ProviderId[]> {
  let order: ProviderId[] = [...SEARCH_PROVIDERS];
  try {
    const { data } = await createAdminClient().from("application_settings").select("value").eq("key", "search_providers").maybeSingle();
    const o = (data?.value as { order?: ProviderId[] } | undefined)?.order;
    if (o?.length) order = [...o.filter((x) => SEARCH_PROVIDERS.includes(x)), ...SEARCH_PROVIDERS.filter((x) => !o.includes(x))];
  } catch { /* defaults */ }
  return order;
}

export async function searchWith(provider: ProviderId, q: string, o: SearchOpts = {}): Promise<SearchHit[]> {
  const creds = await getCredentials(provider);
  if (!creds) throw new HttpError(503, `${provider} is not configured.`, { code: "missing_configuration", provider });
  await assertWithinBudget(provider);
  try {
    const hits = await ADAPTERS[provider](q, creds, o);
    await recordUsage({ provider, operation: o.news ? "news_search" : "web_search", success: true, jobId: o.jobId, userId: o.userId });
    return hits.filter((h) => h.url && /^https?:\/\//.test(h.url));
  } catch (e) {
    await recordUsage({ provider, operation: "web_search", success: false, error: (e as Error).message, status: (e as HttpError).status, jobId: o.jobId, userId: o.userId });
    throw e;
  }
}

/**
 * Multi-provider search with fallback. Uses the first configured provider; if it
 * errors or returns fewer than `minResults`, the next provider is also queried
 * and results are merged (deduplicated by URL).
 */
export async function webSearch(q: string, o: SearchOpts & { minResults?: number } = {}) {
  const order = await searchProviderOrder();
  const configured: ProviderId[] = [];
  for (const p of order) if (await getCredentials(p)) configured.push(p);
  if (!configured.length) throw new HttpError(503, "No web search provider is configured. Add SERPER_API_KEY (Settings → Integrations).", { code: "missing_configuration" });
  const errors: { provider: ProviderId; error: string }[] = [];
  const seen = new Map<string, SearchHit>();
  const used: ProviderId[] = [];
  for (const p of configured) {
    try {
      const hits = await searchWith(p, q, o);
      used.push(p);
      for (const h of hits) { const k = canonicalUrl(h.url); if (!seen.has(k)) seen.set(k, h); }
      if (seen.size >= (o.minResults ?? 3)) break;
    } catch (e) {
      errors.push({ provider: p, error: (e as Error).message });
      if ((e as HttpError).status === 402) break; // budget reached — stop everywhere
    }
  }
  if (!used.length) throw new HttpError(502, `All search providers failed: ${errors.map((e) => `${e.provider}: ${e.error}`).join(" | ")}`, { errors });
  return { hits: [...seen.values()], providers: used, errors };
}

export function canonicalUrl(u: string) {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|ref_)/i.test(k)) x.searchParams.delete(k);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + (x.search || "")).toLowerCase();
  } catch { return u.toLowerCase(); }
}
