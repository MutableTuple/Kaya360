import { NextResponse } from "next/server";
import { route, must } from "@/lib/api";
import { buildPdf } from "@/lib/export";
import { companyBranding } from "@/lib/exportData";
import { label, PROJECT_STAGES, OPPORTUNITY_CLASSES, STAGE_LABEL } from "@/lib/constants";

const inr = (v: unknown) => (v == null ? "—" : `Rs. ${Number(v).toLocaleString("en-IN")}`);
const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : "Unknown");

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const db = ctx.supabase;
  const p = must(await db.from("v_projects").select("*").eq("id", id).maybeSingle());
  const [{ data: st }, { data: src }, { data: ct }, { data: lead }] = await Promise.all([
    db.from("project_stakeholders").select("*").eq("project_id", id),
    db.from("lead_sources").select("*").eq("project_id", id),
    db.from("contacts").select("full_name,designation,direct_email,company_email,email_verification_status,professional_phone,company_phone").eq("project_id", id).is("deleted_at", null),
    db.from("v_leads").select("*").eq("project_id", id).is("deleted_at", null).maybeSingle(),
  ]);
  const b = await companyBranding(db);
  const buf = buildPdf({
    title: p.name, subtitle: `${p.project_code}${p.is_demo ? " · DEMO RECORD" : ""}`, ...b,
    sections: [
      { heading: "Identification & location", kv: [["Client", p.client_name ?? "—"], ["Parent organisation", p.parent_organisation ?? "—"], ["Category", p.category ?? "—"], ["Reference no.", p.reference_number ?? "—"], ["Location", [p.locality, p.city, p.state, p.pin_code].filter(Boolean).join(", ") || "—"], ["Address", p.full_address ?? "—"]] },
      { heading: "Project details", kv: [["Area", p.area_sqft ? `${Number(p.area_sqft).toLocaleString("en-IN")} sq ft` : "—"], ["Floors", p.floors?.toString() ?? "—"], ["Building type", p.building_type ?? "—"], ["Estimated project value", inr(p.estimated_project_value)], ["Estimated interior value", inr(p.estimated_interior_value)], ["Current stage", label(PROJECT_STAGES, p.current_stage)], ["Announced", p.announcement_date ?? "—"], ["Expected completion", p.expected_completion ?? "—"], ["Interior commencement", p.interior_commencement ?? "—"], ["Contractor appointment", p.contractor_appointment_status?.replace(/_/g, " ") ?? "—"]] },
      { heading: "Opportunity assessment", kv: [["Classification", label(OPPORTUNITY_CLASSES, p.opportunity_class)], ["Evidence", p.opportunity_evidence ?? "—"], ["Civil finishing", yn(p.req_civil_finishing)], ["Furniture", yn(p.req_furniture)], ["MEP", yn(p.req_mep)], ["Flooring", yn(p.req_flooring)], ["Ceilings & partitions", yn(p.req_ceiling_partition)], ["Carpentry & joinery", yn(p.req_carpentry_joinery)], ["Renovation", yn(p.req_renovation)], ["Relevance to Kaya", p.relevance_reason ?? "—"]] },
      ...(lead ? [{ heading: "Lead status", kv: [["Lead", lead.lead_code], ["Score", `${lead.score}/100 (${lead.priority})`], ["Pipeline stage", STAGE_LABEL[lead.stage] ?? lead.stage], ["Assigned to", lead.assigned_name ?? "Unassigned"], ["Next follow-up", lead.next_follow_up ? new Date(lead.next_follow_up).toLocaleString("en-IN") : "—"]] as [string, string][] }] : []),
      { heading: "Stakeholders", table: { cols: [{ key: "role", header: "Role" }, { key: "stakeholder_name", header: "Name" }, { key: "source_url", header: "Source" }], rows: st ?? [] } },
      { heading: "Decision makers", table: { cols: [{ key: "full_name", header: "Name" }, { key: "designation", header: "Designation" }, { key: "direct_email", header: "Direct email" }, { key: "company_email", header: "Company email" }, { key: "email_verification_status", header: "Verification" }], rows: ct ?? [] } },
      { heading: "Sources", table: { cols: [{ key: "title", header: "Title" }, { key: "url", header: "URL" }, { key: "retrieved_at", header: "Retrieved", type: "date" }], rows: src ?? [] } },
    ],
  });
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${p.project_code}.pdf"` } });
});
