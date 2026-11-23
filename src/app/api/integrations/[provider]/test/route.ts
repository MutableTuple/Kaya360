import { route, HttpError } from "@/lib/api";
import { providerDef, requireCredentials, recordUsage, providerFetch, type ProviderId } from "@/lib/integrations/registry";
import { searchWith } from "@/lib/integrations/search";
// import { testVerifyProvider } from "@/lib/integrations/verify";
import { geocode } from "@/lib/integrations/geocode";
import { env } from "@/lib/env";

/** Live connection test: makes a real, minimal call to the provider. */
export const POST = route<{ provider: string }>(async (_req, ctx, { provider }) => {
  const def = providerDef(provider as ProviderId);
  const id = def.id;
  const t0 = Date.now();
  let detail: string;
  switch (id) {
    case "openai": {
      const c = await requireCredentials("openai");
      const j = (await providerFetch("openai", `https://api.openai.com/v1/models/${encodeURIComponent(env.openaiModel())}`, { headers: { Authorization: `Bearer ${c.api_key}` } })) as { id: string };
      await recordUsage({ provider: "openai", operation: "test", success: true, cost: 0, userId: ctx.user.id });
      detail = `Model ${j.id} is available.`; break;
    }
    case "serper": {
      const hits = await searchWith(id, "interior fit-out tender Mumbai", { num: 3, userId: ctx.user.id });
      detail = `Search returned ${hits.length} result(s).`; break;
    }
    // case "hunter": detail = await testVerifyProvider(id); break; // Hunter disabled
    // case "gmail": {
    // const c = await requireCredentials("gmail");
    // if (!/\.apps\.googleusercontent\.com$/.test(c.client_id)) throw new HttpError(400, "The OAuth client ID should end with .apps.googleusercontent.com");
    // detail = `OAuth client configured. Redirect URI to register in Google Cloud: ${env.appUrl()}/api/email/oauth/callback. Each user connects their mailbox in Email Centre.`; break;
    // }
    case "nominatim": {
      const g = await geocode("Bandra Kurla Complex, Mumbai", ctx.user.id);
      if (!g) throw new HttpError(502, "Geocoder returned no result for a known address.");
      detail = `Geocoded test address via ${g.source} (${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}).`; break;
    }
    default: throw new HttpError(400, "No test available.");
  }
  return { ok: true, provider: id, detail, ms: Date.now() - t0 };
}, { roles: ["administrator", "bd_manager"], limit: 20 });
