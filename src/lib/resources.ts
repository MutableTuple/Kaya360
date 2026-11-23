import { z } from "zod";
import { STATES, type Region } from "./geo";

const str = (max = 500) => z.string().max(max).optional().nullable().transform((v) => (v === "" ? null : v));
const text = () => str(20000);
const num = () => z.union([z.number(), z.string()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Number(v))).refine((v) => v === null || v === undefined || Number.isFinite(v), "must be a number");
const int = () => num().transform((v) => (v == null ? v : Math.round(v)));
const bool = () => z.union([z.boolean(), z.string()]).optional().nullable().transform((v) => (v === "" || v == null ? null : v === true || v === "true"));
const date = () => str(40).refine((v) => !v || !isNaN(Date.parse(v)), "invalid date");
const url = () => str(2000).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "must start with http:// or https://");
const email = () => str(320).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "invalid email");
const uuid = () => z.string().uuid().optional().nullable().or(z.literal("").transform(() => null));
const oneOf = <T extends [string, ...string[]]>(vals: T) => z.enum(vals).optional().nullable().or(z.literal("").transform(() => null));

export interface ResourceDef {
  table: string; view?: string; label: string; softDelete: boolean;
  search: string[]; sortable: string[]; defaultSort: string;
  filters: Record<string, { col: string; op: "eq" | "in" | "gte" | "lte" | "ilike" | "isnull" | "notnull" | "region" | "bool" | "isfalse" }>;
  schema?: z.ZodObject<z.ZodRawShape>;
  writeRoles?: "write" | "manager" | "admin";
  readOnly?: boolean;
  scoreAffecting?: boolean;
  idCol?: string;
}

const projectSchema = z.object({
  name: z.string().min(2).max(400), reference_number: str(), client_company_id: uuid(), parent_organisation: str(), category: str(), description: text(),
  country: str(), state: str(), city: str(), locality: str(), full_address: str(1000), pin_code: str(6).refine((v) => !v || /^[1-9][0-9]{5}$/.test(v), "PIN must be 6 digits"),
  latitude: num(), longitude: num(), area_sqft: num(), size_band: oneOf(["lt_5k", "5k_10k", "10k_25k", "25k_50k", "50k_100k", "gt_100k", "unknown"]), floors: int(),
  building_type: str(), estimated_project_value: num(), estimated_interior_value: num(), announcement_date: date(), start_date: date(), expected_completion: date(),
  current_stage: oneOf(["announced", "planning", "design", "tendering", "construction", "interior_fit_out", "renovation", "vendor_appointment_pending", "completed", "unknown"]),
  interior_commencement: date(), contractor_appointment_status: oneOf(["not_started", "open", "in_progress", "appointed", "unknown"]),
  opportunity_class: z.enum(["CONFIRMED_REQUIREMENT", "POTENTIAL_OPPORTUNITY", "UNVERIFIED_ANNOUNCEMENT"]).optional(), opportunity_evidence: text(),
  interior_execution_potential: text(), req_civil_finishing: bool(), req_furniture: bool(), req_mep: bool(), req_flooring: bool(), req_ceiling_partition: bool(),
  req_carpentry_joinery: bool(), req_renovation: bool(), outsourcing_potential: text(), relevance_reason: text(),
  primary_source_url: url(), primary_source_title: str(), secondary_reference: str(2000), verification_status: oneOf(["verified", "partially_verified", "unverified", "outdated"]),
});

const companySchema = z.object({
  name: z.string().min(2).max(300), company_type: oneOf(["corporate_client", "real_estate_developer", "property_owner", "architecture_firm", "interior_design_firm", "pmc", "design_and_build", "general_contractor", "epc_contractor", "facility_management", "retail_chain", "hospital_chain", "hotel_group", "bank", "educational_institution", "government", "other"]),
  industry: str(), website: url(), headquarters: str(), office_locations: z.array(z.string().max(200)).optional(), registered_address: str(1000), company_size: str(),
  business_category: str(), current_projects_summary: text(), expansion_activity: text(), procurement_department: str(), vendor_registration_url: url(),
  linkedin_url: url(), official_email: email(), official_phone: str(40), city: str(), state: str(), notes: text(), research_date: date(),
});

const contactSchema = z.object({
  full_name: z.string().min(2).max(200), designation: str(), role_group: oneOf(["project_management", "procurement", "corporate_facilities", "design", "pmc_contracting", "leadership", "other"]),
  company_id: uuid(), department: str(), company_email: email(), direct_email: email(), direct_email_source: str(2000),
  company_phone: str(40), professional_phone: str(40), phone_status: oneOf(["official_company", "public_professional", "unverified", "unavailable"]),
  linkedin_url: url().refine((v) => !v || /linkedin\.com\//i.test(v), "must be a linkedin.com URL"), office_location: str(), project_id: uuid(), source_url: url(), source_note: text(),
});

const leadSchema = z.object({
  title: str(), project_id: uuid(), company_id: uuid(), primary_contact_id: uuid(), tender_id: uuid(),
  stage: oneOf(["newly_discovered", "research_pending", "decision_maker_identified", "contact_verified", "intro_email_sent", "follow_up_required", "meeting_scheduled", "site_visit_scheduled", "boq_rfq_received", "quotation_submitted", "technical_discussion", "commercial_negotiation", "project_awarded", "lost", "on_hold"]),
  lead_source: oneOf(["ai_discovery", "tender_discovery", "manual", "referral", "inbound", "import"]), assigned_to: uuid(), last_contact_date: date(), next_follow_up: date(),
  estimated_value: num(), lost_reason: text(), notes: text(),
  score_adjustment: int().refine((v) => v == null || (v >= -100 && v <= 100), "between -100 and 100"), score_adjustment_reason: str(1000),
});

const tenderSchema = z.object({
  organisation: z.string().min(2).max(300), title: z.string().min(3).max(1000), reference_number: str(), work_description: text(), category: str(), location: str(),
  state: str(), city: str(), estimated_value: num(), emd_amount: num(), publication_date: date(), submission_deadline: date(), eligibility: text(),
  required_experience: text(), document_url: url(), submission_url: url(), status: oneOf(["active", "upcoming", "closed", "cancelled", "awarded", "unknown"]),
  source_url: url(), source_title: str(), verification_status: oneOf(["verified", "partially_verified", "unverified", "outdated"]),
});

const followUpSchema = z.object({
  lead_id: uuid(), company_id: uuid(), contact_id: uuid(), tender_id: uuid(),
  activity_type: z.enum(["phone_call", "email", "whatsapp", "linkedin", "meeting", "site_visit", "boq_received", "quotation_submitted", "negotiation", "tender_deadline", "other"]).optional(),
  title: z.string().min(2).max(300), due_at: z.string().refine((v) => !isNaN(Date.parse(v)), "invalid date/time"), duration_minutes: int(),
  notes: text(), next_action: str(1000), assigned_to: uuid(), status: oneOf(["pending", "done", "cancelled"]), outcome: text(),
});

const templateSchema = z.object({ name: z.string().min(2).max(200), category: str(), subject: z.string().min(2).max(500), body: z.string().min(5).max(20000) });
const stakeholderSchema = z.object({ project_id: z.string().uuid(), company_id: uuid(), stakeholder_name: z.string().min(2).max(300), role: z.enum(["client", "developer", "architect", "interior_designer", "pmc", "design_and_build", "general_contractor", "procurement_agency", "existing_contractor", "other"]), source_url: url(), confirmed: bool() });
const sourceSchema = z.object({ project_id: uuid(), company_id: uuid(), contact_id: uuid(), tender_id: uuid(), url: z.string().url(), title: str(), publisher: str(), published_at: date(), excerpt: text(), source_type: oneOf(["web", "news", "press_release", "company_website", "tender_portal", "linkedin", "directory", "enrichment_api", "manual"]), is_primary: bool() });
const assignmentSchema = z.object({ user_id: z.string().uuid(), scope: z.enum(["state", "city", "category", "company", "lead"]), scope_value: z.string().min(1).max(300), is_primary: bool() });
const savedSearchSchema = z.object({ name: z.string().min(2).max(200), kind: z.enum(["projects", "tenders", "decision_makers", "leads"]), params: z.record(z.string(), z.unknown()), schedule: oneOf(["none", "daily", "weekly", "monthly"]) });

export const RESOURCES: Record<string, ResourceDef> = {
  projects: { table: "projects", view: "v_projects", label: "Project", softDelete: true, search: ["name", "client_name", "city", "locality", "project_code", "reference_number"], sortable: ["name", "city", "state", "category", "current_stage", "created_at", "estimated_project_value", "area_sqft", "lead_score", "announcement_date"], defaultSort: "created_at",
    filters: { state: { col: "state", op: "in" }, city: { col: "city", op: "in" }, region: { col: "state", op: "region" }, category: { col: "category", op: "in" }, stage: { col: "current_stage", op: "in" }, opportunity_class: { col: "opportunity_class", op: "in" }, size_band: { col: "size_band", op: "in" }, client: { col: "client_company_id", op: "eq" }, from: { col: "created_at", op: "gte" }, to: { col: "created_at", op: "lte" }, demo: { col: "is_demo", op: "bool" }, no_demo: { col: "is_demo", op: "isfalse" }, has_coords: { col: "latitude", op: "notnull" } },
    schema: projectSchema, scoreAffecting: true },
  companies: { table: "companies", view: "v_companies", label: "Company", softDelete: true, search: ["name", "industry", "headquarters", "city", "domain"], sortable: ["name", "company_type", "city", "created_at", "project_count", "contact_count"], defaultSort: "name",
    filters: { company_type: { col: "company_type", op: "in" }, state: { col: "state", op: "in" }, city: { col: "city", op: "in" }, demo: { col: "is_demo", op: "bool" }, no_demo: { col: "is_demo", op: "isfalse" } }, schema: companySchema },
  contacts: { table: "contacts", view: "v_contacts", label: "Contact", softDelete: true, search: ["full_name", "designation", "company_name", "direct_email", "company_email"], sortable: ["full_name", "designation", "company_name", "email_verification_status", "created_at", "last_verified_at"], defaultSort: "created_at",
    filters: { company: { col: "company_id", op: "eq" }, project: { col: "project_id", op: "eq" }, role_group: { col: "role_group", op: "in" }, email_status: { col: "email_verification_status", op: "in" }, phone_status: { col: "phone_status", op: "in" }, demo: { col: "is_demo", op: "bool" }, no_demo: { col: "is_demo", op: "isfalse" } },
    schema: contactSchema, scoreAffecting: true },
  leads: { table: "leads", view: "v_leads", label: "Lead", softDelete: true, search: ["title", "lead_code", "project_name", "company_name", "contact_name", "city"], sortable: ["lead_code", "project_name", "company_name", "city", "state", "score", "stage", "next_follow_up", "last_contact_date", "estimated_value", "discovered_at", "created_at"], defaultSort: "score",
    filters: { state: { col: "state", op: "in" }, city: { col: "city", op: "in" }, region: { col: "state", op: "region" }, company: { col: "company_id", op: "eq" }, category: { col: "category", op: "in" }, project_stage: { col: "project_stage", op: "in" }, stage: { col: "stage", op: "in" }, priority: { col: "priority", op: "in" }, score_min: { col: "score", op: "gte" }, score_max: { col: "score", op: "lte" }, has_contact: { col: "primary_contact_id", op: "notnull" }, no_contact: { col: "primary_contact_id", op: "isnull" }, email_status: { col: "contact_email_status", op: "in" }, source: { col: "lead_source", op: "in" }, assigned: { col: "assigned_to", op: "eq" }, discovered_from: { col: "discovered_at", op: "gte" }, discovered_to: { col: "discovered_at", op: "lte" }, follow_from: { col: "next_follow_up", op: "gte" }, follow_to: { col: "next_follow_up", op: "lte" }, archived: { col: "archived_at", op: "notnull" }, demo: { col: "is_demo", op: "bool" }, no_demo: { col: "is_demo", op: "isfalse" }, project: { col: "project_id", op: "eq" } },
    schema: leadSchema },
  tenders: { table: "tenders", view: "v_tenders", label: "Tender", softDelete: true, search: ["title", "organisation", "reference_number", "location", "city"], sortable: ["submission_deadline", "publication_date", "organisation", "estimated_value", "created_at", "state"], defaultSort: "submission_deadline",
    filters: { status: { col: "deadline_status", op: "in" }, organisation: { col: "organisation", op: "ilike" }, state: { col: "state", op: "in" }, category: { col: "category", op: "in" }, value_min: { col: "estimated_value", op: "gte" }, value_max: { col: "estimated_value", op: "lte" }, demo: { col: "is_demo", op: "bool" }, no_demo: { col: "is_demo", op: "isfalse" } },
    schema: tenderSchema },
  follow_ups: { table: "follow_ups", view: "v_follow_ups", label: "Follow-up", softDelete: false, search: ["title", "notes", "lead_title", "company_name", "contact_name"], sortable: ["due_at", "created_at", "status"], defaultSort: "due_at",
    filters: { status: { col: "status", op: "in" }, type: { col: "activity_type", op: "in" }, assigned: { col: "assigned_to", op: "eq" }, lead: { col: "lead_id", op: "eq" }, from: { col: "due_at", op: "gte" }, to: { col: "due_at", op: "lte" } },
    schema: followUpSchema },
  email_templates: { table: "email_templates", label: "Template", softDelete: false, search: ["name", "subject"], sortable: ["name", "category", "created_at"], defaultSort: "name", filters: { category: { col: "category", op: "in" } }, schema: templateSchema },
  project_stakeholders: { table: "project_stakeholders", label: "Stakeholder", softDelete: false, search: ["stakeholder_name"], sortable: ["role", "created_at"], defaultSort: "role", filters: { project: { col: "project_id", op: "eq" }, company: { col: "company_id", op: "eq" } }, schema: stakeholderSchema, scoreAffecting: false },
  lead_sources: { table: "lead_sources", label: "Source", softDelete: false, search: ["url", "title", "publisher"], sortable: ["retrieved_at"], defaultSort: "retrieved_at", filters: { project: { col: "project_id", op: "eq" }, company: { col: "company_id", op: "eq" }, contact: { col: "contact_id", op: "eq" }, tender: { col: "tender_id", op: "eq" } }, schema: sourceSchema },
  team_assignments: { table: "team_assignments", label: "Assignment", softDelete: false, search: ["scope_value"], sortable: ["scope", "created_at"], defaultSort: "scope", filters: { user: { col: "user_id", op: "eq" } }, schema: assignmentSchema, writeRoles: "manager" },
  saved_searches: { table: "saved_searches", label: "Saved search", softDelete: false, search: ["name"], sortable: ["name", "created_at", "last_run_at"], defaultSort: "created_at", filters: { kind: { col: "kind", op: "in" } }, schema: savedSearchSchema },
  lead_activities: { table: "lead_activities", label: "Activity", softDelete: false, search: ["summary"], sortable: ["created_at"], defaultSort: "created_at", filters: { lead: { col: "lead_id", op: "eq" }, kind: { col: "kind", op: "in" } }, readOnly: true },
  email_logs: { table: "email_logs", view: "v_email_logs", label: "Email", softDelete: false, search: ["to_email", "subject", "contact_name", "company_name"], sortable: ["created_at", "sent_at", "status"], defaultSort: "created_at", filters: { status: { col: "status", op: "in" }, lead: { col: "lead_id", op: "eq" }, contact: { col: "contact_id", op: "eq" } }, readOnly: true },
  discovery_jobs: { table: "discovery_jobs", label: "Discovery job", softDelete: false, search: ["title"], sortable: ["created_at"], defaultSort: "created_at", filters: { kind: { col: "kind", op: "in" }, status: { col: "status", op: "in" } }, readOnly: true },
  discovery_results: { table: "discovery_results", label: "Result", softDelete: false, search: ["title", "source_url"], sortable: ["created_at", "preview_score"], defaultSort: "preview_score", filters: { job: { col: "job_id", op: "eq" }, review: { col: "review_status", op: "in" }, type: { col: "result_type", op: "in" }, class: { col: "opportunity_class", op: "in" } }, readOnly: true },
  audit_logs: { table: "audit_logs", label: "Audit entry", softDelete: false, search: ["table_name", "actor_email", "record_id"], sortable: ["created_at"], defaultSort: "created_at", filters: { table: { col: "table_name", op: "eq" }, record: { col: "record_id", op: "eq" }, action: { col: "action", op: "in" } }, readOnly: true },
  notifications: { table: "notifications", label: "Notification", softDelete: false, search: ["title"], sortable: ["created_at"], defaultSort: "created_at", filters: { unread: { col: "read_at", op: "isnull" } }, readOnly: true },
  integration_usage: { table: "integration_usage", label: "Usage", softDelete: false, search: ["provider", "operation", "error"], sortable: ["created_at"], defaultSort: "created_at", filters: { provider: { col: "provider", op: "in" }, failed: { col: "error", op: "notnull" }, from: { col: "created_at", op: "gte" } }, readOnly: true },
  email_verifications: { table: "email_verifications", label: "Verification", softDelete: false, search: ["email"], sortable: ["checked_at"], defaultSort: "checked_at", filters: { contact: { col: "contact_id", op: "eq" } }, readOnly: true },
};

export function statesForRegions(regions: string[]) {
  return STATES.filter((s) => regions.includes(s.region as Region)).map((s) => s.name);
}

export interface ListQuery { q?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number; filters: Record<string, string>; includeDeleted?: boolean }

export function parseListQuery(sp: URLSearchParams): ListQuery {
  const filters: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (k.startsWith("f_") && v !== "") filters[k.slice(2)] = v;
  return {
    q: sp.get("q") ?? undefined, sort: sp.get("sort") ?? undefined, dir: sp.get("dir") === "asc" ? "asc" : sp.get("dir") === "desc" ? "desc" : undefined,
    page: Math.max(1, Number(sp.get("page") ?? 1) || 1), pageSize: Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25) || 25)), filters,
    includeDeleted: sp.get("deleted") === "1",
  };
}

/** PostgREST `or` values must escape commas/parentheses. */
export function escapeLike(v: string) { return v.replace(/[%_\\]/g, (m) => `\\${m}`).replace(/[,()]/g, " ").replace(/"/g, ""); }
