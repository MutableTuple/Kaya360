import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (req, ctx) => {
  const db = ctx.supabase;
  const includeDemo = req.nextUrl.searchParams.get("demo") !== "0";
  const now = new Date().toISOString();
  const demo = <T,>(q: T) => (includeDemo ? q : (q as unknown as { eq: (c: string, v: boolean) => T }).eq("is_demo", false));
  const [stats, charts, latest, hot, upcoming, overdue, contacts, tenders, companies] = await Promise.all([
    db.rpc("dashboard_stats", { include_demo: includeDemo }),
    db.rpc("dashboard_charts", { include_demo: includeDemo }),
    demo(db.from("v_projects").select("id,project_code,name,client_name,city,category,opportunity_class,lead_score,created_at,is_demo").is("deleted_at", null)).order("created_at", { ascending: false }).limit(8),
    demo(db.from("v_leads").select("id,lead_code,project_name,company_name,city,score,stage,contact_name,next_follow_up,is_demo").is("deleted_at", null).is("archived_at", null).eq("priority", "hot")).order("score", { ascending: false }).limit(8),
    db.from("v_follow_ups").select("id,title,activity_type,due_at,lead_id,lead_title,company_name,assigned_name").eq("status", "pending").gte("due_at", now).order("due_at").limit(8),
    db.from("v_follow_ups").select("id,title,activity_type,due_at,lead_id,lead_title,company_name,assigned_name").eq("status", "pending").lt("due_at", now).order("due_at").limit(8),
    demo(db.from("v_contacts").select("id,full_name,designation,company_name,email_verification_status,created_at,is_demo").is("deleted_at", null)).order("created_at", { ascending: false }).limit(8),
    demo(db.from("v_tenders").select("id,title,organisation,submission_deadline,deadline_status,is_demo").is("deleted_at", null).gte("submission_deadline", now)).order("submission_deadline").limit(8),
    demo(db.from("companies").select("id,name,company_type,updated_at,is_demo").is("deleted_at", null)).order("updated_at", { ascending: false }).limit(8),
  ]);
  if (stats.error) throw stats.error;
  if (charts.error) throw charts.error;
  return {
    stats: stats.data, charts: charts.data,
    widgets: { latest: latest.data ?? [], hot: hot.data ?? [], upcoming: upcoming.data ?? [], overdue: overdue.data ?? [], contacts: contacts.data ?? [], tenders: tenders.data ?? [], companies: companies.data ?? [] },
  };
});
