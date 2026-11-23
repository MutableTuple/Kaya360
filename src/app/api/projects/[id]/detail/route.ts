import { route, must } from "@/lib/api";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const db = ctx.supabase;
  const project = must(await db.from("v_projects").select("*").eq("id", id).maybeSingle());
  const [stake, sources, contacts, attachments, lead, audit] = await Promise.all([
    db.from("project_stakeholders").select("*").eq("project_id", id).order("role"),
    db.from("lead_sources").select("*").eq("project_id", id).order("is_primary", { ascending: false }),
    db.from("contacts").select("*").eq("project_id", id).is("deleted_at", null),
    db.from("project_attachments").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("v_leads").select("*").eq("project_id", id).is("deleted_at", null).maybeSingle(),
    ["administrator", "bd_manager"].includes(ctx.profile.role) ? db.from("audit_logs").select("*").eq("table_name", "projects").eq("record_id", id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
  ]);
  return { project, stakeholders: stake.data ?? [], sources: sources.data ?? [], contacts: contacts.data ?? [], attachments: attachments.data ?? [], lead: lead.data, audit: audit.data ?? [] };
});
