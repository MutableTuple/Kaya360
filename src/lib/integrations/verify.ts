import "server-only";
import { HttpError } from "../api";
import { assertWithinBudget, getCredentials, providerFetch, recordUsage, requireCredentials, VERIFY_PROVIDERS, type ProviderId } from "./registry";

export type VerifyStatus = "verified" | "invalid" | "catch_all" | "unknown";
export interface VerifyResult { email: string; provider: ProviderId; status: VerifyStatus; raw: string; confidence: number | null; response: unknown }

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function mapHunter(d: { status?: string; result?: string; score?: number }): VerifyStatus {
  switch (d.status) {
    case "valid": return "verified";
    case "invalid": case "disposable": return "invalid";
    case "accept_all": return "catch_all";
    case "webmail": return d.result === "deliverable" ? "verified" : "unknown";
    default: return d.result === "undeliverable" ? "invalid" : "unknown";
  }
}
export async function verifyEmail(email: string, preferred?: ProviderId, userId?: string): Promise<VerifyResult> {
  // DISABLED — Hunter email verification commented out for now.
  throw new HttpError(503, "Email verification is turned off.", { code: "missing_configuration" });
  //   email = email.trim().toLowerCase();
  //   // Format is checked only to avoid wasting a paid call — a valid format is NEVER treated as verified.
  //   if (!EMAIL_RE.test(email)) throw new HttpError(400, `“${email}” is not a well-formed email address.`);
  //   const order = preferred ? [preferred, ...VERIFY_PROVIDERS.filter((p) => p !== preferred)] : VERIFY_PROVIDERS;
  //   let provider: ProviderId | null = null;
  //   for (const p of order) if (await getCredentials(p)) { provider = p; break; }
  //   if (!provider) throw new HttpError(503, "No email verification provider is configured. Add HUNTER_API_KEY (Settings → Integrations).", { code: "missing_configuration" });
  //   const c = await requireCredentials(provider);
  //   await assertWithinBudget(provider);
  //   try {
  //     const j = (await providerFetch("hunter", `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${c.api_key}`, { timeoutMs: 40_000 })) as { data: { status?: string; result?: string; score?: number } };
  //     const out: VerifyResult = { email, provider, status: mapHunter(j.data), raw: j.data.status ?? j.data.result ?? "unknown", confidence: j.data.score ?? null, response: j.data };
  //     await recordUsage({ provider, operation: "verify_email", success: true, userId });
  //     return out;
  //   } catch (e) {
  //     await recordUsage({ provider, operation: "verify_email", success: false, error: (e as Error).message, userId });
  //     throw e;
  //   }
}

// ---------------- Hunter enrichment (sourced public emails only) ----------------
export interface HunterPerson {
  value: string; first_name: string | null; last_name: string | null; position: string | null; department: string | null;
  linkedin: string | null; phone_number: string | null; confidence: number; type: "personal" | "generic";
  sources: { uri: string; extracted_on?: string }[]; verification?: { status?: string; date?: string };
}

export async function hunterDomainSearch(domain: string, opts: { limit?: number; userId?: string; department?: string } = {}): Promise<{ organization?: string; pattern?: string; emails: HunterPerson[] }> {
  // DISABLED — Hunter email verification commented out for now.
  throw new HttpError(503, "Hunter is turned off.", { code: "missing_configuration" });
  //   const c = await requireCredentials("hunter");
  //   await assertWithinBudget("hunter");
  //   const u = new URL("https://api.hunter.io/v2/domain-search");
  //   u.searchParams.set("domain", domain); u.searchParams.set("api_key", c.api_key); u.searchParams.set("limit", String(opts.limit ?? 25));
  //   if (opts.department) u.searchParams.set("department", opts.department);
  //   try {
  //     const j = (await providerFetch("hunter", u.toString())) as { data: { organization?: string; pattern?: string; emails: HunterPerson[] } };
  //     await recordUsage({ provider: "hunter", operation: "domain_search", success: true, userId: opts.userId });
  //     return j.data;
  //   } catch (e) {
  //     await recordUsage({ provider: "hunter", operation: "domain_search", success: false, error: (e as Error).message, userId: opts.userId });
  //     throw e;
  //   }
}

/** Email finder. Returns `publiclySourced: false` when Hunter only inferred a pattern — callers must NOT attach those to the person. */
export async function hunterEmailFinder(domain: string, first: string, last: string, userId?: string): Promise<{ email: string | null; score: number | null; sources: { uri: string }[]; publiclySourced: boolean; verification?: { status?: string } }> {
  // DISABLED — Hunter email verification commented out for now.
  throw new HttpError(503, "Hunter is turned off.", { code: "missing_configuration" });
  //   const c = await requireCredentials("hunter");
  //   await assertWithinBudget("hunter");
  //   const u = new URL("https://api.hunter.io/v2/email-finder");
  //   u.searchParams.set("domain", domain); u.searchParams.set("first_name", first); u.searchParams.set("last_name", last); u.searchParams.set("api_key", c.api_key);
  //   try {
  //     const j = (await providerFetch("hunter", u.toString())) as { data: { email: string | null; score: number | null; position?: string; sources?: { uri: string }[]; verification?: { status?: string } } };
  //     await recordUsage({ provider: "hunter", operation: "email_finder", success: true, userId });
  //     const d = j.data;
  //     return { email: d.email, score: d.score, sources: d.sources ?? [], publiclySourced: (d.sources?.length ?? 0) > 0, verification: d.verification };
  //   } catch (e) {
  //     await recordUsage({ provider: "hunter", operation: "email_finder", success: false, error: (e as Error).message, userId });
  //     throw e;
  //   }
}

export async function testVerifyProvider(p: ProviderId) {
  // DISABLED — Hunter email verification commented out for now.
  throw new HttpError(400, "Email verification is turned off.");
  //   const c = await requireCredentials(p);
  //   const j = (await providerFetch(p, `https://api.hunter.io/v2/account?api_key=${c.api_key}`)) as { data: { email?: string } };
  //   return `Connected as ${j.data.email ?? "account"}`;
}
