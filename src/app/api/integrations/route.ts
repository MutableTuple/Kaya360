import { route } from "@/lib/api";
import { PROVIDERS, getCredentials } from "@/lib/integrations/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Status of every integration. Never returns key values — only where they come from. */
export const GET = route(async (_req, ctx) => {
  const admin = createAdminClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: stored }, { data: usage }, { data: limits }] = await Promise.all([
    admin.from("integration_secrets").select("provider,updated_at"),
    admin.from("integration_usage").select("provider,success,est_cost_usd,created_at,error").gte("created_at", monthStart.toISOString()).limit(100000),
    admin.from("application_settings").select("value").eq("key", "usage_limits").maybeSingle(),
  ]);
  const out = [];
  for (const p of PROVIDERS) {
    const envSet = p.fields.length > 0 && p.fields.every((f) => !!process.env[f.env]);
    const creds = await getCredentials(p.id);
    const u = (usage ?? []).filter((x) => x.provider === p.id);
    const lastErr = u.filter((x) => !x.success).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    out.push({
      id: p.id, name: p.name, category: p.category, description: p.description, docs: p.docs, keyless: !!p.keyless,
      fields: p.fields.map((f) => ({ name: f.name, label: f.label, env: f.env, secret: f.secret, set: !!process.env[f.env] })),
      configured: !!creds, source: p.keyless ? "none_required" : envSet ? "environment" : creds ? "database" : null,
      storedAt: stored?.find((s) => s.provider === p.id)?.updated_at ?? null,
      usage: { calls: u.length, failures: u.filter((x) => !x.success).length, cost: +u.reduce((s, x) => s + Number(x.est_cost_usd), 0).toFixed(4), lastError: lastErr?.error ?? null, lastErrorAt: lastErr?.created_at ?? null },
      limit: Number((limits?.value as Record<string, number> | undefined)?.[p.id] ?? 0),
    });
  }
  return {
    integrations: out,
    platform: { supabase: env.isSupabaseConfigured(), serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY, encryptionKey: (process.env.APP_ENCRYPTION_KEY ?? "").length >= 32, cronSecret: !!process.env.CRON_SECRET, appUrl: env.appUrl(), replyTracking: process.env.GMAIL_TRACK_REPLIES === "true" },
    canEdit: ctx.profile.role === "administrator",
  };
});
