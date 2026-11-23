import { route, must } from "@/lib/api";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const db = ctx.supabase;
  const lead = must(await db.from("v_leads").select("*").eq("id", id).maybeSingle());
  const [project, activities, followUps, emails, contacts, audit] = await Promise.all([
    lead.project_id ? db.from("v_projects").select("*").eq("id", lead.project_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("lead_activities").select("*, author:profiles!lead_activities_created_by_fkey(full_name,email)").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("v_follow_ups").select("*").eq("lead_id", id).order("due_at"),
    db.from("email_logs").select("id,to_email,subject,status,sent_at,created_at,replied_at").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("v_contacts").select("*").is("deleted_at", null).or([`id.eq.${lead.primary_contact_id ?? "00000000-0000-0000-0000-000000000000"}`, lead.project_id ? `project_id.eq.${lead.project_id}` : null, lead.company_id ? `company_id.eq.${lead.company_id}` : null].filter(Boolean).join(",")).limit(100),
    ["administrator", "bd_manager"].includes(ctx.profile.role) ? db.from("audit_logs").select("*").eq("table_name", "leads").eq("record_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
  ]);
  return { lead, project: project.data, activities: activities.data ?? [], followUps: followUps.data ?? [], emails: emails.data ?? [], contacts: contacts.data ?? [], audit: audit.data ?? [] };
});
