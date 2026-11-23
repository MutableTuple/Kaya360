import { route, must } from "@/lib/api";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const db = ctx.supabase;
  const company = must(await db.from("v_companies").select("*").eq("id", id).maybeSingle());
  const [projects, contacts, leads, stake, sources] = await Promise.all([
    db.from("v_projects").select("id,project_code,name,city,current_stage,opportunity_class,lead_score,created_at").eq("client_company_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("contacts").select("*").eq("company_id", id).is("deleted_at", null).order("full_name"),
    db.from("v_leads").select("id,lead_code,project_name,stage,score,priority,assigned_name").eq("company_id", id).is("deleted_at", null),
    db.from("project_stakeholders").select("role, project:projects(id,name,city)").eq("company_id", id),
    db.from("lead_sources").select("*").eq("company_id", id).order("retrieved_at", { ascending: false }).limit(50),
  ]);
  return { company, projects: projects.data ?? [], contacts: contacts.data ?? [], leads: leads.data ?? [], stakeholderOf: stake.data ?? [], sources: sources.data ?? [] };
});
