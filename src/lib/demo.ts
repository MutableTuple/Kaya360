import "server-only";
import { createAdminClient } from "./supabase/admin";
import { recomputeLeadScore } from "./leadService";

// Sample records for training/testing. Every row is flagged is_demo = true and
// every name is prefixed “[DEMO]”. Emails use the reserved example.com domain.
export async function loadDemo(userId: string) {
  const db = createAdminClient();
  const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("is_demo", true);
  if ((count ?? 0) > 0) return { created: 0, message: "Demo data is already loaded." };
  const companies = [
    { name: "[DEMO] Horizon Tech Parks", company_type: "real_estate_developer", city: "Pune", state: "Maharashtra", website: "https://horizon-demo.example.com" },
    { name: "[DEMO] Meridian Hospitals", company_type: "hospital_chain", city: "Ahmedabad", state: "Gujarat", website: "https://meridian-demo.example.com" },
    { name: "[DEMO] Northstar Financial", company_type: "bank", city: "Gurugram", state: "Haryana", website: "https://northstar-demo.example.com" },
    { name: "[DEMO] Atelier PMC Consultants", company_type: "pmc", city: "Mumbai", state: "Maharashtra", website: "https://atelier-demo.example.com" },
  ].map((c) => ({ ...c, is_demo: true, created_by: userId, notes: "DEMO record — not real." }));
  const { data: cos, error } = await db.from("companies").insert(companies).select("id,name");
  if (error) throw error;
  const id = (n: string) => cos!.find((c) => c.name.includes(n))!.id;
  const projects = [
    { name: "[DEMO] Horizon Tower B Corporate Office", client_company_id: id("Horizon"), category: "Corporate offices", city: "Pune", state: "Maharashtra", locality: "Hinjewadi", area_sqft: 60000, size_band: "50k_100k", current_stage: "tendering", contractor_appointment_status: "open", opportunity_class: "CONFIRMED_REQUIREMENT", opportunity_evidence: "DEMO: Interior contractor bids invited for floors 4–9.", estimated_project_value: 180000000, estimated_interior_value: 90000000, latitude: 18.5912, longitude: 73.7389, req_civil_finishing: true, req_furniture: true, req_ceiling_partition: true, primary_source_url: "https://example.com/demo/horizon" },
    { name: "[DEMO] Meridian Hospital Expansion Wing", client_company_id: id("Meridian"), category: "Hospitals", city: "Ahmedabad", state: "Gujarat", area_sqft: 35000, size_band: "25k_50k", current_stage: "construction", contractor_appointment_status: "not_started", opportunity_class: "POTENTIAL_OPPORTUNITY", estimated_project_value: 250000000, latitude: 23.0225, longitude: 72.5714, req_flooring: true, req_carpentry_joinery: true, primary_source_url: "https://example.com/demo/meridian" },
    { name: "[DEMO] Northstar Regional Office Fit-out", client_company_id: id("Northstar"), category: "Banks", city: "Gurugram", state: "Haryana", area_sqft: 18000, size_band: "10k_25k", current_stage: "design", contractor_appointment_status: "unknown", opportunity_class: "UNVERIFIED_ANNOUNCEMENT", estimated_project_value: 45000000, latitude: 28.4595, longitude: 77.0266, primary_source_url: "https://example.com/demo/northstar" },
  ].map((p) => ({ ...p, is_demo: true, created_by: userId, verification_status: "unverified", relevance_reason: "DEMO record for training." }));
  const { data: prs, error: pe } = await db.from("projects").insert(projects).select("id,name,client_company_id,estimated_project_value");
  if (pe) throw pe;
  const contacts = [
    { full_name: "[DEMO] Asha Demo", designation: "Head of Projects", role_group: "project_management", company_id: id("Horizon"), project_id: prs![0].id, direct_email: "asha.demo@example.com", email_verification_status: "not_checked", phone_status: "unavailable" },
    { full_name: "[DEMO] Vikram Sample", designation: "Procurement Manager", role_group: "procurement", company_id: id("Meridian"), project_id: prs![1].id, company_email: "procurement@example.com", email_verification_status: "not_checked", phone_status: "unavailable" },
  ].map((c) => ({ ...c, is_demo: true, created_by: userId, source_note: "DEMO record — not real." }));
  const { data: cts, error: ce } = await db.from("contacts").insert(contacts).select("id,project_id");
  if (ce) throw ce;
  const stages = ["quotation_submitted", "decision_maker_identified", "newly_discovered"];
  const { data: leads, error: le } = await db.from("leads").insert(prs!.map((p, i) => ({
    title: p.name, project_id: p.id, company_id: p.client_company_id, primary_contact_id: cts!.find((c) => c.project_id === p.id)?.id ?? null,
    stage: stages[i], lead_source: "demo", estimated_value: p.estimated_project_value, assigned_to: userId, is_demo: true, created_by: userId,
    next_follow_up: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
  }))).select("id");
  if (le) throw le;
  for (const l of leads ?? []) await recomputeLeadScore(db, l.id);
  await db.from("tenders").insert({ organisation: "[DEMO] Municipal Corporation", title: "[DEMO] Interior works for administrative block", reference_number: "DEMO/2026/001", state: "Maharashtra", city: "Mumbai", status: "active", submission_deadline: new Date(Date.now() + 5 * 86400000).toISOString(), estimated_value: 32000000, is_demo: true, created_by: userId, source_url: "https://example.com/demo/tender" });
  await db.from("follow_ups").insert((leads ?? []).map((l, i) => ({ lead_id: l.id, title: `[DEMO] ${["Call", "Site visit", "Send capability deck"][i]}`, activity_type: ["phone_call", "site_visit", "email"][i], due_at: new Date(Date.now() + (i - 1) * 86400000).toISOString(), assigned_to: userId, is_demo: true, created_by: userId })));
  return { created: projects.length, message: "Demo data loaded. All records are marked [DEMO]." };
}

export async function removeDemo() {
  const db = createAdminClient();
  for (const t of ["follow_ups", "leads", "contacts", "tenders", "projects", "companies"]) {
    const { error } = await db.from(t).delete().eq("is_demo", true);
    if (error) throw error;
  }
  return { message: "All demo records removed." };
}
