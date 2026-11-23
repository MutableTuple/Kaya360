import { route } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const { data, error } = await ctx.supabase.from("email_logs").update({ replied_at: new Date().toISOString() }).eq("id", id).select("id,lead_id").single();
  if (error) throw error;
  if (data.lead_id) await ctx.supabase.from("lead_activities").insert({ lead_id: data.lead_id, kind: "email", summary: "Reply received (logged manually)", created_by: ctx.user.id });
  return { ok: true };
}, { roles: WRITE_ROLES });
