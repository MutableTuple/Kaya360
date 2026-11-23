import { z } from "zod";
import { route, body, HttpError } from "@/lib/api";
import { providerDef, clearCredentialCache, type ProviderId } from "@/lib/integrations/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

/** Store credentials entered in the UI — encrypted server-side, never returned to the browser. */
export const PUT = route<{ provider: string }>(async (req, ctx, { provider }) => {
  const def = providerDef(provider as ProviderId);
  const values = z.record(z.string(), z.string().max(4000)).parse((await body<{ values: unknown }>(req)).values);
  const clean: Record<string, string> = {};
  for (const f of def.fields) if (values[f.name]?.trim()) clean[f.name] = values[f.name].trim();
  if (!Object.keys(clean).length) throw new HttpError(400, "Enter at least one value.");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("integration_secrets").select("encrypted_value").eq("provider", provider).maybeSingle();
  let merged = clean;
  if (existing) { const { decrypt } = await import("@/lib/crypto"); merged = { ...JSON.parse(decrypt(existing.encrypted_value)), ...clean }; }
  const { error } = await admin.from("integration_secrets").upsert({ provider, encrypted_value: encrypt(JSON.stringify(merged)), updated_by: ctx.user.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  clearCredentialCache(provider as ProviderId);
  await ctx.supabase.from("audit_logs").insert({ table_name: "integration_secrets", record_id: provider, action: "CONFIG", new_data: { fields: Object.keys(clean) }, actor_id: ctx.user.id, actor_email: ctx.user.email });
  return { ok: true, message: `${def.name} credentials saved. Use “Test connection” to confirm they work.` };
}, { roles: ["administrator"] });

export const DELETE = route<{ provider: string }>(async (_req, ctx, { provider }) => {
  providerDef(provider as ProviderId);
  const { error } = await createAdminClient().from("integration_secrets").delete().eq("provider", provider);
  if (error) throw error;
  clearCredentialCache(provider as ProviderId);
  await ctx.supabase.from("audit_logs").insert({ table_name: "integration_secrets", record_id: provider, action: "CONFIG", new_data: { removed: true }, actor_id: ctx.user.id, actor_email: ctx.user.email });
  return { ok: true };
}, { roles: ["administrator"] });
