import { route, HttpError, body, sanitize } from "@/lib/api";
import { listResource, resource } from "@/lib/listQuery";
import { parseListQuery } from "@/lib/resources";
import { recomputeLeadScore, recomputeRelated, syncNextFollowUp } from "@/lib/leadService";
import { WRITE_ROLES, MANAGER_ROLES, type Role } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const GET = route<{ resource: string }>(async (req, ctx, { resource: name }) => {
  const def = resource(name);
  if (["audit_logs", "integration_usage"].includes(name) && !MANAGER_ROLES.includes(ctx.profile.role)) throw new HttpError(403, "Only managers can view this log.");
  void def;
  return listResource(ctx.supabase, name, parseListQuery(req.nextUrl.searchParams));
});

export const POST = route<{ resource: string }>(async (req, ctx, { resource: name }) => {
  const def = resource(name);
  if (def.readOnly || !def.schema) throw new HttpError(405, `${def.label} records cannot be created here.`);
  const allowed: Role[] = def.writeRoles === "manager" ? MANAGER_ROLES : def.writeRoles === "admin" ? ["administrator"] : WRITE_ROLES;
  if (!allowed.includes(ctx.profile.role)) throw new HttpError(403, "Your role cannot create records.");
  const input = def.schema.parse(sanitize(await body(req)));
  const row: Record<string, unknown> = { ...input };
  if (["projects", "companies", "contacts", "leads", "tenders", "follow_ups", "email_templates"].includes(def.table)) row.created_by = ctx.user.id;
  if (def.table === "saved_searches") row.owner_id = ctx.user.id;
  if (def.table === "follow_ups" && !row.assigned_to) row.assigned_to = ctx.user.id;
  if (def.table === "leads" && !row.lead_source) row.lead_source = "manual";
  const { data, error } = await ctx.supabase.from(def.table).insert(row).select("*").single();
  if (error) throw error;
  if (def.table === "leads") await recomputeLeadScore(ctx.supabase, data.id);
  if (def.table === "contacts") await recomputeRelated(ctx.supabase, { projectId: data.project_id, companyId: data.company_id });
  if (def.table === "follow_ups" && data.lead_id) {
    await ctx.supabase.from("lead_activities").insert({ lead_id: data.lead_id, kind: "follow_up", summary: `Follow-up scheduled: ${data.title} (${new Date(data.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })})`, created_by: ctx.user.id });
    await syncNextFollowUp(ctx.supabase, data.lead_id);
  }
  return { record: data };
}, { limit: 240 });

