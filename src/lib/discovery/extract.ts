import "server-only";
import { chatJSON } from "../integrations/openai";
import { areaGrounded, groundClassification, groundContacts, monetaryGrounded, nameGrounded, quoteGrounded, textContains, yearGrounded, type OppClass, type RawContact } from "./grounding";

const S = { type: ["string", "null"] } as const;
const N = { type: ["number", "null"] } as const;
const B = { type: ["boolean", "null"] } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });

const CONTACT_SCHEMA = obj({ name: S, designation: S, company: S, email: S, phone: S, linkedin_url: S });

const PROJECT_SCHEMA = obj({
  projects: {
    type: "array",
    items: obj({
      name: { type: "string" }, client_company: S, client_website: S, parent_organisation: S, category: S, description: S,
      state: S, city: S, locality: S, address: S, area_sqft: N, floors: N, building_type: S,
      estimated_project_value_inr: N, announcement_date: S, expected_completion: S, interior_commencement: S,
      current_stage: { type: "string", enum: ["announced", "planning", "design", "tendering", "construction", "interior_fit_out", "renovation", "vendor_appointment_pending", "completed", "unknown"] },
      contractor_appointment_status: { type: "string", enum: ["not_started", "open", "in_progress", "appointed", "unknown"] },
      opportunity_class: { type: "string", enum: ["CONFIRMED_REQUIREMENT", "POTENTIAL_OPPORTUNITY", "UNVERIFIED_ANNOUNCEMENT"] },
      evidence_quote: S,
      architect: S, interior_designer: S, pmc: S, design_and_build: S, general_contractor: S, existing_interior_contractor: S,
      req_civil_finishing: B, req_furniture: B, req_mep: B, req_flooring: B, req_ceiling_partition: B, req_carpentry_joinery: B, req_renovation: B,
      interior_execution_potential: S, outsourcing_potential: S, relevance_reason: S,
      contacts: { type: "array", items: CONTACT_SCHEMA },
    }),
  },
});

const TENDER_SCHEMA = obj({
  tenders: {
    type: "array",
    items: obj({
      organisation: { type: "string" }, title: { type: "string" }, reference_number: S, work_description: S, category: S,
      location: S, state: S, city: S, estimated_value_inr: N, emd_inr: N, publication_date: S, submission_deadline: S,
      eligibility: S, required_experience: S, document_url: S, submission_url: S,
      status: { type: "string", enum: ["active", "upcoming", "closed", "cancelled", "awarded", "unknown"] }, evidence_quote: S,
    }),
  },
});

const PEOPLE_SCHEMA = obj({ people: { type: "array", items: CONTACT_SCHEMA } });

const KAYA_CONTEXT = `You are a research analyst for KAYA INTERIORS PRIVATE LIMITED, an Indian interior contracting company (turnkey interior execution, commercial fit-outs, civil finishing, furniture manufacturing/installation, modular furniture, carpentry, flooring, false ceilings, partitions, painting, electrical).`;

const RULES = `STRICT RULES:
- Use ONLY facts stated in the SOURCE TEXT. Never use outside knowledge. Never guess.
- If a field is not stated, return null (or "unknown" for enums). Do not estimate numbers.
- evidence_quote must be copied VERBATIM (exact words) from the source — one or two sentences.
- opportunity_class: CONFIRMED_REQUIREMENT only if the source explicitly says contractors/vendors/bids are being sought for interior or fit-out work; POTENTIAL_OPPORTUNITY if a real upcoming/ongoing project with likely interior scope is described; UNVERIFIED_ANNOUNCEMENT if vague, speculative, or a rumour.
- Never state a project is looking for contractors unless the text says so.
- Contacts: include a person only if their name appears in the text; include email/phone only if written in the text exactly. Never construct or guess an email address.
- Dates as YYYY-MM-DD (or YYYY-MM-01 / YYYY-01-01 if only month/year is given). Money in INR (1 crore = 10,000,000; 1 lakh = 100,000).
- Return an empty list if the page contains no relevant project.`;

export interface ExtractedProject {
  name: string; client_company: string | null; client_website: string | null; parent_organisation: string | null; category: string | null; description: string | null;
  state: string | null; city: string | null; locality: string | null; address: string | null; area_sqft: number | null; floors: number | null; building_type: string | null;
  estimated_project_value_inr: number | null; announcement_date: string | null; expected_completion: string | null; interior_commencement: string | null;
  current_stage: string; contractor_appointment_status: string; opportunity_class: OppClass; evidence_quote: string | null;
  architect: string | null; interior_designer: string | null; pmc: string | null; design_and_build: string | null; general_contractor: string | null; existing_interior_contractor: string | null;
  req_civil_finishing: boolean | null; req_furniture: boolean | null; req_mep: boolean | null; req_flooring: boolean | null; req_ceiling_partition: boolean | null; req_carpentry_joinery: boolean | null; req_renovation: boolean | null;
  interior_execution_potential: string | null; outsourcing_potential: string | null; relevance_reason: string | null;
  contacts: RawContact[]; grounding_notes: string[];
}

export async function extractProjects(src: { url: string; title: string; text: string; date?: string }, ctx: { geography: string; categories: string[]; jobId?: string; userId?: string }): Promise<ExtractedProject[]> {
  const user = `TARGET: interior contracting opportunities in ${ctx.geography} (categories: ${ctx.categories.join(", ") || "any commercial"}).
SOURCE URL: ${src.url}
SOURCE TITLE: ${src.title}
${src.date ? `SOURCE DATE: ${src.date}\n` : ""}SOURCE TEXT:
"""
${src.text}
"""
Extract every distinct Indian construction/interior project in the source that could require interior contracting. ${RULES}`;
  const r = await chatJSON<{ projects: ExtractedProject[] }>(KAYA_CONTEXT, user, { name: "projects", schema: PROJECT_SCHEMA }, { jobId: ctx.jobId, userId: ctx.userId, operation: "extract_projects" });
  return (r.projects ?? []).map((p) => groundProject(src.text, p)).filter((p): p is ExtractedProject => !!p);
}

export function groundProject(text: string, p: ExtractedProject): ExtractedProject | null {
  const notes: string[] = [];
  if (!p.name || p.name.length < 3) return null;
  // the client or a distinctive part of the project name must appear in the source
  if (p.client_company && !nameGrounded(text, p.client_company) && !textContains(text, p.client_company)) { notes.push(`Client “${p.client_company}” not found in source — removed.`); p.client_company = null; }
  if (!p.client_company && !textContains(text, p.name) && !nameGrounded(text, p.name)) return null;
  p.opportunity_class = groundClassification(text, p.opportunity_class, p.evidence_quote, notes);
  if (!quoteGrounded(text, p.evidence_quote)) p.evidence_quote = null;
  if (p.area_sqft != null && !areaGrounded(text)) { p.area_sqft = null; notes.push("Area removed — no area figure in source."); }
  if (p.estimated_project_value_inr != null && !monetaryGrounded(text)) { p.estimated_project_value_inr = null; notes.push("Value removed — no monetary figure in source."); }
  for (const k of ["announcement_date", "expected_completion", "interior_commencement"] as const) if (p[k] && !yearGrounded(text, p[k])) { p[k] = null; }
  for (const k of ["architect", "interior_designer", "pmc", "design_and_build", "general_contractor", "existing_interior_contractor", "city", "locality"] as const) {
    if (p[k] && !textContains(text, p[k]!) && !nameGrounded(text, p[k]!)) { notes.push(`${k.replace(/_/g, " ")} “${p[k]}” not in source — removed.`); p[k] = null; }
  }
  if (p.client_website && !textContains(text, p.client_website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])) p.client_website = null;
  p.contacts = groundContacts(text, p.contacts ?? [], notes);
  p.grounding_notes = notes;
  return p;
}

export interface ExtractedTender {
  organisation: string; title: string; reference_number: string | null; work_description: string | null; category: string | null;
  location: string | null; state: string | null; city: string | null; estimated_value_inr: number | null; emd_inr: number | null;
  publication_date: string | null; submission_deadline: string | null; eligibility: string | null; required_experience: string | null;
  document_url: string | null; submission_url: string | null; status: string; evidence_quote: string | null; grounding_notes: string[];
}

export async function extractTenders(src: { url: string; title: string; text: string }, ctx: { geography: string; jobId?: string; userId?: string }): Promise<ExtractedTender[]> {
  const user = `TARGET: Indian tenders / RFQs / RFPs / EOIs / empanelments for interior works, fit-outs, civil finishing, furniture & joinery, ceilings, partitions, flooring or painting${ctx.geography ? ` (preferably ${ctx.geography})` : ""}.
SOURCE URL: ${src.url}
SOURCE TITLE: ${src.title}
SOURCE TEXT:
"""
${src.text}
"""
Extract each relevant tender. reference_number and submission_deadline must be copied exactly as printed; if not printed return null. Do not infer status from dates you are unsure of; use "unknown". ${RULES}`;
  const r = await chatJSON<{ tenders: ExtractedTender[] }>(KAYA_CONTEXT, user, { name: "tenders", schema: TENDER_SCHEMA }, { jobId: ctx.jobId, userId: ctx.userId, operation: "extract_tenders" });
  return (r.tenders ?? []).map((t) => groundTender(src.text, t)).filter((t): t is ExtractedTender => !!t);
}

export function groundTender(text: string, t: ExtractedTender): ExtractedTender | null {
  const notes: string[] = [];
  if (!t.title || !t.organisation) return null;
  if (!textContains(text, t.organisation) && !nameGrounded(text, t.organisation)) return null;
  if (t.reference_number && !text.replace(/\s+/g, "").toLowerCase().includes(t.reference_number.replace(/\s+/g, "").toLowerCase())) { t.reference_number = null; notes.push("Reference number not printed in source — removed."); }
  if (t.submission_deadline && !yearGrounded(text, t.submission_deadline)) { t.submission_deadline = null; notes.push("Deadline not printed in source — removed."); }
  if (t.publication_date && !yearGrounded(text, t.publication_date)) t.publication_date = null;
  if (t.estimated_value_inr != null && !monetaryGrounded(text)) t.estimated_value_inr = null;
  if (t.emd_inr != null && !/emd|earnest money/i.test(text)) t.emd_inr = null;
  if (!quoteGrounded(text, t.evidence_quote)) t.evidence_quote = null;
  // Status: derive from a grounded deadline if possible, otherwise keep only an explicit "closed"/"cancelled".
  if (t.submission_deadline) {
    const d = new Date(t.submission_deadline);
    if (!isNaN(d.getTime())) t.status = d.getTime() < Date.now() ? "closed" : "active";
  } else if (!["closed", "cancelled", "awarded"].includes(t.status)) t.status = "unknown";
  for (const k of ["document_url", "submission_url"] as const) if (t[k] && !/^https?:\/\//.test(t[k]!)) t[k] = null;
  t.grounding_notes = notes;
  return t;
}

export async function extractPeople(src: { url: string; title: string; text: string }, ctx: { company: string; titles: string[]; jobId?: string; userId?: string }): Promise<RawContact[]> {
  const user = `Find professionals who currently work at "${ctx.company}" in roles relevant to interior contracting decisions (e.g. ${ctx.titles.slice(0, 12).join(", ")}).
SOURCE URL: ${src.url}
SOURCE TITLE: ${src.title}
SOURCE TEXT:
"""
${src.text}
"""
Return only people explicitly associated with ${ctx.company} in the text, with their designation as written. ${RULES}`;
  const r = await chatJSON<{ people: RawContact[] }>(KAYA_CONTEXT, user, { name: "people", schema: PEOPLE_SCHEMA }, { jobId: ctx.jobId, userId: ctx.userId, operation: "extract_people" });
  const notes: string[] = [];
  return groundContacts(src.text, r.people ?? [], notes).filter((p) => !p.company || nameGrounded(src.text, ctx.company) || textContains(src.text, ctx.company));
}
