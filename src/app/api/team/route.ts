import { z } from "zod";
import { route, body, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx) => {
  const { data, error } = await ctx.supabase.from("profiles").select("id,email,full_name,role,is_active,designation,phone,last_seen_at,created_at").order("full_name");
  if (error) throw error;
  const { data: leads } = await ctx.supabase.from("leads").select("assigned_to,priority,stage").is("deleted_at", null).limit(20000);
  const stats: Record<string, { leads: number; hot: number; awarded: number }> = {};
  for (const l of leads ?? []) { if (!l.assigned_to) continue; const s = (stats[l.assigned_to] ??= { leads: 0, hot: 0, awarded: 0 }); s.leads++; if (l.priority === "hot") s.hot++; if (l.stage === "project_awarded") s.awarded++; }
  return { users: (data ?? []).map((u) => ({ ...u, stats: stats[u.id] ?? { leads: 0, hot: 0, awarded: 0 } })) };
});

const Invite = z.object({ email: z.string().email(), full_name: z.string().min(2).max(120), role: z.enum(ROLES), designation: z.string().max(120).optional() });

/** Invite a user (Supabase sends the invitation email). Role is set server-side after creation. */
export const POST = route(async (req, ctx) => {
  const i = Invite.parse(await body(req));
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(i.email, { data: { full_name: i.full_name }, redirectTo: `${env.appUrl()}/auth/callback?next=/reset-password` });
  if (error) throw new HttpError(400, `Invitation failed: ${error.message}`);
  const uid = data.user.id;
  for (let k = 0; k < 5; k++) {
    const { data: p } = await admin.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (p) break; await new Promise((r) => setTimeout(r, 300));
  }
  const { error: pe } = await admin.from("profiles").update({ role: i.role, full_name: i.full_name, designation: i.designation ?? null }).eq("id", uid);
  if (pe) throw pe;
  await ctx.supabase.from("audit_logs").insert({ table_name: "profiles", record_id: uid, action: "CONFIG", new_data: { invited: i.email, role: i.role }, actor_id: ctx.user.id, actor_email: ctx.user.email });
  return { ok: true, message: `Invitation sent to ${i.email}.` };
}, { roles: ["administrator"], limit: 20 });
