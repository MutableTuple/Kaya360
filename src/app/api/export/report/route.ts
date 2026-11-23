import { NextResponse } from "next/server";
import { route, HttpError } from "@/lib/api";
import { buildPdf, EXPORT_COLUMNS } from "@/lib/export";
import { companyBranding, fetchAll } from "@/lib/exportData";
import { STAGE_LABEL } from "@/lib/constants";

export const maxDuration = 60;
const inr = (v: unknown) => `Rs. ${Number(v ?? 0).toLocaleString("en-IN")}`;

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams; const kind = sp.get("kind") ?? "monthly";
  const b = await companyBranding(ctx.supabase);
  let buf: Buffer;
  if (kind === "hot") {
    const q = new URLSearchParams(sp); q.set("f_priority", "hot"); q.set("sort", "score");
    const rows = await fetchAll(ctx.supabase, "leads", q);
    buf = buildPdf({ title: "Hot Lead Report", subtitle: `${rows.length} hot lead(s) (score 80+)`, ...b, landscape: true, sections: [{ heading: "Hot leads", table: { cols: EXPORT_COLUMNS.leads.filter((c) => ["lead_code", "project_name", "company_name", "city", "contact_name", "contact_designation", "contact_email_status", "score", "stage", "assigned_name", "next_follow_up", "estimated_value"].includes(c.key)), rows: rows.map((r) => ({ ...r, stage: STAGE_LABEL[r.stage as string] })) } }] });
  } else if (kind === "opportunity") {
    const rows = await fetchAll(ctx.supabase, "projects", sp);
    buf = buildPdf({ title: "Project Opportunity Report", subtitle: `${rows.length} project(s)`, ...b, landscape: true, sections: [
      { heading: "Summary", kv: [["Confirmed requirements", String(rows.filter((r) => r.opportunity_class === "CONFIRMED_REQUIREMENT").length)], ["Potential opportunities", String(rows.filter((r) => r.opportunity_class === "POTENTIAL_OPPORTUNITY").length)], ["Unverified announcements", String(rows.filter((r) => r.opportunity_class === "UNVERIFIED_ANNOUNCEMENT").length)]] },
      { heading: "Projects", table: { cols: EXPORT_COLUMNS.projects.filter((c) => ["project_code", "name", "client_name", "city", "category", "current_stage", "opportunity_class", "area_sqft", "estimated_project_value", "lead_score"].includes(c.key)), rows } }] });
  } else if (kind === "monthly") {
    const month = sp.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const start = `${month}-01`; const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 10);
    const db = ctx.supabase;
    const [{ data: stats }, newLeads, moves, fu, { data: emails }] = await Promise.all([
      db.rpc("dashboard_stats", { include_demo: false }),
      db.from("v_leads").select("lead_code,project_name,company_name,city,score,priority,stage,assigned_name,estimated_value").is("deleted_at", null).eq("is_demo", false).gte("created_at", start).lt("created_at", end).order("score", { ascending: false }).limit(500),
      db.from("lead_activities").select("to_stage").eq("kind", "stage_change").gte("created_at", start).lt("created_at", end).limit(10000),
      db.from("follow_ups").select("status").gte("due_at", start).lt("due_at", end).limit(10000),
      db.from("email_logs").select("status").eq("status", "sent").gte("sent_at", start).lt("sent_at", end).limit(10000),
    ]);
    const mv = (s: string) => (moves.data ?? []).filter((m) => m.to_stage === s).length;
    const s = (stats ?? {}) as Record<string, number>;
    const byCity = new Map<string, number>(); for (const l of newLeads.data ?? []) byCity.set(l.city ?? "Unknown", (byCity.get(l.city ?? "Unknown") ?? 0) + 1);
    buf = buildPdf({ title: `Monthly Business Development Report — ${month}`, subtitle: "Excludes DEMO records", ...b, sections: [
      { heading: "Activity this month", kv: [["New leads", String(newLeads.data?.length ?? 0)], ["Introduction emails sent", String(emails?.length ?? 0)], ["Meetings scheduled", String(mv("meeting_scheduled"))], ["Site visits scheduled", String(mv("site_visit_scheduled"))], ["BOQ / RFQ received", String(mv("boq_rfq_received"))], ["Quotations submitted", String(mv("quotation_submitted"))], ["Projects awarded", String(mv("project_awarded"))], ["Lost", String(mv("lost"))], ["Follow-ups completed / due", `${(fu.data ?? []).filter((f) => f.status === "done").length} / ${fu.data?.length ?? 0}`]] },
      { heading: "Pipeline position (all time)", kv: [["Total leads", String(s.total_leads ?? 0)], ["Hot / warm", `${s.hot_leads ?? 0} / ${s.warm_leads ?? 0}`], ["Active enquiries", String(s.active_enquiries ?? 0)], ["Open pipeline value", inr(s.pipeline_value)], ["Awarded value", inr(s.awarded_value)]] },
      { heading: "New leads by city", table: { cols: [{ key: "city", header: "City" }, { key: "n", header: "Leads", type: "number" }], rows: [...byCity.entries()].sort((a, b2) => b2[1] - a[1]).map(([city, n]) => ({ city, n })) } },
      { heading: "New leads", table: { cols: [{ key: "lead_code", header: "Lead" }, { key: "project_name", header: "Project" }, { key: "company_name", header: "Company" }, { key: "city", header: "City" }, { key: "score", header: "Score" }, { key: "stage", header: "Stage" }, { key: "assigned_name", header: "Owner" }], rows: (newLeads.data ?? []).map((r) => ({ ...r, stage: STAGE_LABEL[r.stage] })) } },
    ] });
  } else throw new HttpError(400, "Unknown report.");
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="kaya-${kind}-report-${new Date().toISOString().slice(0, 10)}.pdf"` } });
}, { limit: 20 });
