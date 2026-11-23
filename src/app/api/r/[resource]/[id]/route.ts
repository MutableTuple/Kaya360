import { route, HttpError, body, sanitize, must } from "@/lib/api";
import { resource } from "@/lib/listQuery";
import { recomputeLeadScore, recomputeRelated, syncNextFollowUp } from "@/lib/leadService";
import { WRITE_ROLES, MANAGER_ROLES, type Role } from "@/lib/constants";

export const dynamic = "force-dynamic";
type P = { resource: string; id: string };

export const GET = route<P>(async (_req, ctx, { resource: name, id }) => {
  const def = resource(name);
  const record = must(await ctx.supabase.from(def.view ?? def.table).select("*").eq(def.idCol ?? "id", id).maybeSingle());
  return { record };
});

export const PATCH = route<P>(async (req, ctx, { resource: name, id }) => {
  const def = resource(name);
  if (def.readOnly || !def.schema) throw new HttpError(405, `${def.label} records cannot be edited.`);
  const allowed: Role[] = def.writeRoles === "manager" ? MANAGER_ROLES : WRITE_ROLES;
  if (!allowed.includes(ctx.profile.role)) throw new HttpError(403, "Your role cannot edit records.");
  const raw = sanitize(await body<Record<string, unknown>>(req));
  const input = def.schema.partial().parse(raw) as Record<string, unknown>;
  // only keep keys the client actually sent
  const patch = Object.fromEntries(Object.entries(input).filter(([k]) => k in raw));
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update.");
  if (def.table === "leads" && "score_adjustment" in patch && Number(patch.score_adjustment) !== 0 && String(patch.score_adjustment_reason ?? "").trim().length < 5)
    throw new HttpError(400, "A manual score adjustment needs a reason (at least 5 characters).");
  if (def.table === "follow_ups" && patch.status === "done") patch.completed_at = new Date().toISOString();
  const { data, error } = await ctx.supabase.from(def.table).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, "The record was not updated — it may not exist or your role cannot edit it.");
  if (def.table === "leads") await recomputeLeadScore(ctx.supabase, id);
  if (def.table === "projects") await recomputeRelated(ctx.supabase, { projectId: id });
  if (def.table === "contacts") await recomputeRelated(ctx.supabase, { projectId: data.project_id, companyId: data.company_id });
  if (def.table === "follow_ups" && data.lead_id) {
    if (patch.status === "done") {
      await ctx.supabase.from("lead_activities").insert({ lead_id: data.lead_id, kind: ["meeting", "site_visit"].includes(data.activity_type) ? data.activity_type : data.activity_type === "phone_call" ? "call" : data.activity_type === "email" ? "email" : "follow_up", summary: `Completed: ${data.title}${data.outcome ? ` — ${data.outcome}` : ""}`, created_by: ctx.user.id });
      await ctx.supabase.from("leads").update({ last_contact_date: new Date().toISOString() }).eq("id", data.lead_id);
    }
    await syncNextFollowUp(ctx.supabase, data.lead_id);
  }
  return { record: data };
}, { limit: 300 });

export const DELETE = route<P>(async (req, ctx, { resource: name, id }) => {
  const def = resource(name);
  if (def.readOnly) throw new HttpError(405, `${def.label} records cannot be deleted.`);
  const hard = req.nextUrl.searchParams.get("hard") === "1" || !def.softDelete;
  if (hard && !MANAGER_ROLES.includes(ctx.profile.role) && !["follow_ups", "saved_searches", "project_stakeholders", "lead_sources"].includes(def.table))
    throw new HttpError(403, "Only administrators and BD managers can permanently delete records.");
  if (!WRITE_ROLES.includes(ctx.profile.role)) throw new HttpError(403, "Your role cannot delete records.");
  if (req.nextUrl.searchParams.get("confirm") !== "1") throw new HttpError(400, "Deletion must be confirmed.");
  if (hard) {
    const { data, error } = await ctx.supabase.from(def.table).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new HttpError(403, "Record not deleted — it may not exist or you lack permission.");
  } else {
    const { data, error } = await ctx.supabase.from(def.table).update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new HttpError(403, "Record not deleted — it may not exist or you lack permission.");
  }
  return { ok: true, deleted: id, mode: hard ? "permanent" : "soft" };
});
