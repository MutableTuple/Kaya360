import "server-only";
import { createAdminClient } from "../supabase/admin";
import { decrypt } from "../crypto";
import { HttpError } from "../api";

export type ProviderId =
  | "openai" | "serper" | "hunter" | "gmail" | "nominatim";

export interface ProviderField { name: string; env: string; label: string; secret: boolean }
export interface ProviderDef {
  id: ProviderId; name: string; category: "AI" | "Web research" | "Email verification" | "Email" | "Maps";
  fields: ProviderField[]; docs: string; costPerCallUsd: number; description: string; keyless?: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  { id: "openai", name: "OpenAI", category: "AI", docs: "https://platform.openai.com/api-keys", costPerCallUsd: 0.004,
    description: "Query planning, structured extraction from sources, email drafting and the BD assistant.",
    fields: [{ name: "api_key", env: "OPENAI_API_KEY", label: "API key", secret: true }] },
  { id: "serper", name: "Serper (Google results)", category: "Web research", docs: "https://serper.dev", costPerCallUsd: 0.001,
    description: "Primary web & news search.", fields: [{ name: "api_key", env: "SERPER_API_KEY", label: "API key", secret: true }] },
  // Hunter disabled for now (no email verification needed).
//   { id: "hunter", name: "Hunter", category: "Email verification", docs: "https://hunter.io/api-keys", costPerCallUsd: 0.01,
//     description: "Domain search (sourced public emails), email finder and email verifier.",
//     fields: [{ name: "api_key", env: "HUNTER_API_KEY", label: "API key", secret: true }] },
  // Gmail OAuth disabled — no email sending for now.
//   { id: "gmail", name: "Gmail (Google OAuth)", category: "Email", docs: "https://console.cloud.google.com/apis/credentials", costPerCallUsd: 0,
//     description: "Send approved emails from each user's own Gmail / Google Workspace mailbox.",
//     fields: [
//       { name: "client_id", env: "GOOGLE_OAUTH_CLIENT_ID", label: "OAuth client ID", secret: false },
//       { name: "client_secret", env: "GOOGLE_OAUTH_CLIENT_SECRET", label: "OAuth client secret", secret: true }] },
  { id: "nominatim", name: "OpenStreetMap Nominatim", category: "Maps", docs: "https://operations.osmfoundation.org/policies/nominatim/", costPerCallUsd: 0, keyless: true,
    description: "Free geocoding fallback (max 1 request/second, attribution required).", fields: [] },
];

export const SEARCH_PROVIDERS: ProviderId[] = ["serper"];
export const VERIFY_PROVIDERS: ProviderId[] = []; // was ["hunter"] — re-enable with the Hunter entry above

export function providerDef(id: ProviderId) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new HttpError(400, `Unknown integration ${id}`);
  return p;
}

const cache = new Map<string, { v: Record<string, string> | null; at: number }>();

/** Resolve credentials: server env vars first, then the encrypted DB store. */
export async function getCredentials(id: ProviderId): Promise<Record<string, string> | null> {
  const def = providerDef(id);
  if (def.keyless) return {};
  const fromEnv: Record<string, string> = {};
  for (const f of def.fields) if (process.env[f.env]) fromEnv[f.name] = process.env[f.env]!;
  if (def.fields.every((f) => fromEnv[f.name])) return fromEnv;

  const c = cache.get(id);
  if (c && Date.now() - c.at < 60_000) return c.v;
  let v: Record<string, string> | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("integration_secrets").select("encrypted_value").eq("provider", id).maybeSingle();
    if (data?.encrypted_value) {
      const stored = JSON.parse(decrypt(data.encrypted_value)) as Record<string, string>;
      const merged = { ...stored, ...fromEnv };
      if (def.fields.every((f) => merged[f.name])) v = merged;
    }
  } catch { v = null; }
  cache.set(id, { v, at: Date.now() });
  return v;
}
export function clearCredentialCache(id?: ProviderId) { if (id) cache.delete(id); else cache.clear(); }

export async function requireCredentials(id: ProviderId) {
  const c = await getCredentials(id);
  if (!c) {
    const def = providerDef(id);
    throw new HttpError(503, `${def.name} is not configured. Add ${def.fields.map((f) => f.env).join(" + ")} in your server environment or in Settings → Integrations.`, { code: "missing_configuration", provider: id });
  }
  return c;
}

export async function configuredProviders(ids: ProviderId[]) {
  const out: ProviderId[] = [];
  for (const id of ids) if (await getCredentials(id)) out.push(id);
  return out;
}

export async function recordUsage(u: { provider: ProviderId | string; operation: string; success: boolean; units?: number; cost?: number; status?: number; error?: string; jobId?: string; userId?: string }) {
  try {
    const admin = createAdminClient();
    const def = PROVIDERS.find((p) => p.id === u.provider);
    await admin.from("integration_usage").insert({
      provider: u.provider, operation: u.operation, success: u.success, units: u.units ?? 1,
      est_cost_usd: u.cost ?? (u.success ? (def?.costPerCallUsd ?? 0) * (u.units ?? 1) : 0),
      status_code: u.status ?? null, error: u.error?.slice(0, 1000) ?? null, job_id: u.jobId ?? null, user_id: u.userId ?? null,
    });
  } catch (e) { console.error("[usage] failed to record", e); }
}

/** Enforce the administrator's monthly API budget and per-provider monthly call limits. */
export async function assertWithinBudget(provider: ProviderId) {
  const admin = createAdminClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: lg }, { data: lim }] = await Promise.all([
    admin.from("application_settings").select("value").eq("key", "lead_generation").maybeSingle(),
    admin.from("application_settings").select("value").eq("key", "usage_limits").maybeSingle(),
  ]);
  const budget = Number((lg?.value as Record<string, unknown> | undefined)?.monthly_api_budget_usd ?? 0);
  if (budget > 0) {
    const { data } = await admin.from("integration_usage").select("est_cost_usd").gte("created_at", monthStart.toISOString()).limit(100000);
    const spent = (data ?? []).reduce((s, r) => s + Number(r.est_cost_usd), 0);
    if (spent >= budget) throw new HttpError(402, `Monthly API budget of $${budget} reached (estimated spend $${spent.toFixed(2)}). An administrator can raise it in Settings → Lead generation.`);
  }
  const maxCalls = Number((lim?.value as Record<string, unknown> | undefined)?.[provider] ?? 0);
  if (maxCalls > 0) {
    const { count } = await admin.from("integration_usage").select("id", { count: "exact", head: true }).eq("provider", provider).gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= maxCalls) throw new HttpError(429, `Monthly usage limit for ${providerDef(provider).name} reached (${maxCalls} calls).`);
  }
}

/** fetch with timeout; throws an HttpError carrying the provider's own message. */
export async function providerFetch(provider: ProviderId, url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 25_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    if (!res.ok) {
      const j = json as Record<string, unknown> | null;
      const msg = (j?.error as Record<string, unknown>)?.message ?? j?.message ?? j?.error ?? j?.detail ?? text.slice(0, 300);
      throw new HttpError(res.status === 401 || res.status === 403 ? 502 : res.status >= 500 ? 502 : res.status,
        `${providerDef(provider).name} returned ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, { provider, status: res.status });
    }
    return json;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new HttpError(504, `${providerDef(provider).name} did not respond in time.`, { provider });
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Could not reach ${providerDef(provider).name}: ${(e as Error).message}`, { provider });
  } finally { clearTimeout(t); }
}
