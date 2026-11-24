import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "../normalize";
import { recomputeLeadScore } from "../leadService";
import { roleGroupFor } from "../roleGroups";
import type { ExtractedProject, ExtractedTender } from "./extract";

type Db = SupabaseClient;

function sizeBand(a?: number | null) {
  if (a == null) return "unknown";
  return a < 5000 ? "lt_5k" : a < 10000 ? "5k_10k" : a < 25000 ? "10k_25k" : a < 50000 ? "25k_50k" : a < 100000 ? "50k_100k" : "gt_100k";
}
const dateOrNull = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : d && /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : null);

/** Find a company by normalised name or website domain; create it if absent. */
export async function upsertCompany(db: Db, name: string, extra: Record<string, unknown> = {}, userId?: string) {
  const nn = normalizeText(name);
  if (!nn) return null;
  const { data: found } = await db.from("companies").select("id").eq("normalized_name", nn).is("deleted_at", null).maybeSingle();
  if (found) return found.id as string;
  if (extra.website) {
    const dom = String(extra.website).toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/[/?#:].*$/, "");
    const { data: byDomain } = await db.from("companies").select("id").eq("domain", dom).is("deleted_at", null).maybeSingle();
    if (byDomain) return byDomain.id as string;
  }
  const { data, error } = await db.from("companies").insert({ name: name.trim(), research_date: new Date().toISOString().slice(0, 10), created_by: userId, ...extra }).select("id").single();
  if (error?.code === "23505") {
    const { data: again } = await db.from("companies").select("id").eq("normalized_name", nn).is("deleted_at", null).maybeSingle();
    return (again?.id as string) ?? null;
  }
  if (error) throw error;
  return data.id as string;
}

export async function saveProjectResult(db: Db, result: { id: string; job_id: string; source_url: string; source_title: string | null; payload: ExtractedProject & { source_date?: string | null; snippet?: string; client_contact?: { website: string | null; emails: string[]; phones: string[]; sourceUrl: string | null } | null } }, userId: string) {
  const p = result.payload;
  const cc = p.client_contact;
  const clientId = p.client_company ? await upsertCompany(db, p.client_company, { website: p.client_website ?? cc?.website ?? null, city: p.city, state: p.state, company_type: "corporate_client", official_email: cc?.emails[0] ?? null, official_phone: cc?.phones.slice(0, 2).join(", ").slice(0, 40) || null }, userId) : null;
  if (clientId && cc) {
    // Company already existed: fill only its empty contact fields.
    const { data: co } = await db.from("companies").select("website,official_email,official_phone").eq("id", clientId).single();
    const patch: Record<string, string> = {};
    if (co && !co.website && cc.website) patch.website = cc.website;
    if (co && !co.official_email && cc.emails[0]) patch.official_email = cc.emails[0];
    if (co && !co.official_phone && cc.phones[0]) patch.official_phone = cc.phones.slice(0, 2).join(", ").slice(0, 40);
    if (Object.keys(patch).length) await db.from("companies").update(patch).eq("id", clientId);
    if (cc.sourceUrl) await db.from("lead_sources").insert({ company_id: clientId, url: cc.sourceUrl, title: "Company website (contact details)", source_type: "web", created_by: userId }).then(() => null, () => null);
  }
  const { data: project, error } = await db.from("projects").insert({
    name: p.name, client_company_id: clientId, parent_organisation: p.parent_organisation, category: p.category, description: p.description,
    state: p.state, city: p.city, locality: p.locality, full_address: p.address, area_sqft: p.area_sqft, size_band: sizeBand(p.area_sqft), floors: p.floors != null ? Math.round(p.floors) : null,
    building_type: p.building_type, estimated_project_value: p.estimated_project_value_inr, announcement_date: dateOrNull(p.announcement_date),
    expected_completion: dateOrNull(p.expected_completion), interior_commencement: dateOrNull(p.interior_commencement),
    current_stage: p.current_stage, contractor_appointment_status: p.contractor_appointment_status, opportunity_class: p.opportunity_class,
    opportunity_evidence: p.evidence_quote, interior_execution_potential: p.interior_execution_potential,
    req_civil_finishing: p.req_civil_finishing, req_furniture: p.req_furniture, req_mep: p.req_mep, req_flooring: p.req_flooring,
    req_ceiling_partition: p.req_ceiling_partition, req_carpentry_joinery: p.req_carpentry_joinery, req_renovation: p.req_renovation,
    outsourcing_potential: p.outsourcing_potential, relevance_reason: p.relevance_reason, primary_source_url: result.source_url,
    primary_source_title: result.source_title, last_researched_at: new Date().toISOString(),
    verification_status: p.evidence_quote ? "partially_verified" : "unverified", discovery_job_id: result.job_id, created_by: userId,
  }).select("id").single();
  if (error) throw error;
  const projectId = project.id as string;

  await db.from("lead_sources").insert({ project_id: projectId, url: result.source_url, title: result.source_title, excerpt: p.evidence_quote ?? p.snippet ?? null, published_at: dateOrNull(p.source_date?.slice(0, 10)), source_type: "web", is_primary: true, created_by: userId });
  if (clientId) await db.from("lead_sources").insert({ company_id: clientId, url: result.source_url, title: result.source_title, source_type: "web", created_by: userId }).then(() => null, () => null);

  const stake: [string | null, string][] = [[p.client_company, "client"], [p.architect, "architect"], [p.interior_designer, "interior_designer"], [p.pmc, "pmc"], [p.design_and_build, "design_and_build"], [p.general_contractor, "general_contractor"], [p.existing_interior_contractor, "existing_contractor"]];
  const typeFor: Record<string, string> = { architect: "architecture_firm", interior_designer: "interior_design_firm", pmc: "pmc", design_and_build: "design_and_build", general_contractor: "general_contractor", existing_contractor: "general_contractor" };
  for (const [name, role] of stake) {
    if (!name) continue;
    const cid = role === "client" ? clientId : await upsertCompany(db, name, { company_type: typeFor[role] ?? "other" }, userId);
    await db.from("project_stakeholders").insert({ project_id: projectId, company_id: cid, stakeholder_name: name, role, source_url: result.source_url, confirmed: true });
  }

  let primaryContact: string | null = null;
  for (const c of p.contacts ?? []) {
    if (!c.name) continue;
    const companyId = c.company ? await upsertCompany(db, c.company, {}, userId) : clientId;
    const id = await insertContact(db, { full_name: c.name, designation: c.designation, company_id: companyId, direct_email: c.email, direct_email_source: c.email ? result.source_url : null, professional_phone: c.phone, phone_status: c.phone ? "public_professional" : "unavailable", linkedin_url: c.linkedin_url, project_id: projectId, source_url: result.source_url }, userId);
    if (id && !primaryContact) primaryContact = id;
  }

  const { data: lead, error: le } = await db.from("leads").insert({
    title: p.name, project_id: projectId, company_id: clientId, primary_contact_id: primaryContact, lead_source: "ai_discovery",
    stage: primaryContact ? "decision_maker_identified" : "newly_discovered", estimated_value: p.estimated_project_value_inr, created_by: userId,
  }).select("id").single();
  if (le) throw le;
  await recomputeLeadScore(db, lead.id as string);
  return { projectId, leadId: lead.id as string };
}

export async function insertContact(db: Db, c: Record<string, unknown> & { full_name: string; company_id: string | null }, userId: string) {
  const nn = normalizeText(c.full_name);
  if (c.company_id) {
    const { data: ex } = await db.from("contacts").select("id").eq("company_id", c.company_id).eq("normalized_name", nn).is("deleted_at", null).maybeSingle();
    if (ex) return ex.id as string;
  }
  const role_group = c.role_group ?? roleGroupFor(c.designation as string | null);
  const { data, error } = await db.from("contacts").insert({ ...c, role_group, created_by: userId }).select("id").single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  if (c.source_url) await db.from("lead_sources").insert({ contact_id: data.id, url: c.source_url as string, source_type: /linkedin/.test(String(c.source_url)) ? "linkedin" : "web", created_by: userId }).then(() => null, () => null);
  return data.id as string;
}

export async function saveTenderResult(db: Db, result: { job_id: string; source_url: string; source_title: string | null; payload: ExtractedTender }, userId: string) {
  const t = result.payload;
  const orgId = await upsertCompany(db, t.organisation, { company_type: "government" }, userId).catch(() => null);
  const { data, error } = await db.from("tenders").insert({
    organisation: t.organisation, organisation_company_id: orgId, title: t.title, reference_number: t.reference_number, work_description: t.work_description,
    category: t.category, location: t.location, state: t.state, city: t.city, estimated_value: t.estimated_value_inr, emd_amount: t.emd_inr,
    publication_date: dateOrNull(t.publication_date), submission_deadline: t.submission_deadline && !isNaN(Date.parse(t.submission_deadline)) ? new Date(t.submission_deadline).toISOString() : null,
    eligibility: t.eligibility, required_experience: t.required_experience, document_url: t.document_url, submission_url: t.submission_url,
    status: t.status, source_url: result.source_url, source_title: result.source_title, last_verified_at: new Date().toISOString(),
    verification_status: t.reference_number && t.submission_deadline ? "partially_verified" : "unverified", discovery_job_id: result.job_id, created_by: userId,
  }).select("id").single();
  if (error) throw error;
  await db.from("lead_sources").insert({ tender_id: data.id, url: result.source_url, title: result.source_title, excerpt: t.evidence_quote, source_type: "tender_portal", is_primary: true, created_by: userId });
  if (t.document_url) await db.from("tender_documents").insert({ tender_id: data.id, title: "Tender document (source link)", url: t.document_url, uploaded_by: userId });
  return { tenderId: data.id as string };
}

export async function saveContactResult(db: Db, result: { source_url: string; payload: Record<string, unknown> }, companyId: string | null, projectId: string | null, userId: string) {
  const p = result.payload as { name: string; designation: string | null; email?: string | null; email_type?: string; phone?: string | null; linkedin_url?: string | null; department?: string | null; source?: string; email_confidence?: number; hunter_verification?: { status?: string; date?: string } | null };
  const generic = p.email_type === "generic";
  return insertContact(db, {
    full_name: p.name, designation: p.designation, department: p.department ?? null, company_id: companyId, project_id: projectId,
    direct_email: !generic ? p.email ?? null : null, company_email: generic ? p.email ?? null : null,
    direct_email_source: p.email ? (p.source === "hunter" ? `Hunter (public source: ${result.source_url})` : result.source_url) : null,
    email_confidence: p.email_confidence ?? null, professional_phone: p.phone ?? null, phone_status: p.phone ? "public_professional" : "unavailable",
    linkedin_url: p.linkedin_url && /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(p.linkedin_url) ? p.linkedin_url : null,
    source_url: result.source_url, source_note: p.source === "hunter" ? "Found via Hunter domain search (publicly sourced)" : "Found in public web source",
  }, userId);
}
