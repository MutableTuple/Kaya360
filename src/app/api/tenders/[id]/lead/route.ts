import { route, must } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { recomputeLeadScore } from "@/lib/leadService";

/** Convert a tender into a CRM lead (one lead per tender). */
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const t = must(await ctx.supabase.from("tenders").select("*").eq("id", id).maybeSingle());
  const { data: existing } = await ctx.supabase.from("leads").select("id").eq("tender_id", id).is("deleted_at", null).maybeSingle();
  if (existing) return { record: existing, existed: true };
  const { data, error } = await ctx.supabase.from("leads").insert({ title: t.title, tender_id: id, company_id: t.organisation_company_id, lead_source: "tender_discovery", stage: "boq_rfq_received", estimated_value: t.estimated_value, created_by: ctx.user.id, assigned_to: ctx.user.id, is_demo: t.is_demo }).select("id").single();
  if (error) throw error;
  if (t.submission_deadline) await ctx.supabase.from("follow_ups").insert({ lead_id: data.id, tender_id: id, activity_type: "tender_deadline", title: `Tender submission: ${t.title}`.slice(0, 300), due_at: t.submission_deadline, assigned_to: ctx.user.id, created_by: ctx.user.id });
  await recomputeLeadScore(ctx.supabase, data.id);
  return { record: data, existed: false };
}, { roles: WRITE_ROLES });
