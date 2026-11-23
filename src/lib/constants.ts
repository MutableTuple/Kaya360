export const APP_NAME = "KAYA PROJECT INTELLIGENCE 360";
export const COMPANY_NAME = "KAYA INTERIORS PRIVATE LIMITED";

export const ROLES = ["administrator", "bd_manager", "sales_executive", "researcher", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  bd_manager: "Business Development Manager",
  sales_executive: "Sales Executive",
  researcher: "Researcher",
  viewer: "Viewer",
};
export const WRITE_ROLES: Role[] = ["administrator", "bd_manager", "sales_executive", "researcher"];
export const MANAGER_ROLES: Role[] = ["administrator", "bd_manager"];

export const PROJECT_CATEGORIES = [
  "Corporate offices", "Commercial office interiors", "IT parks", "Business parks", "Retail stores", "Showrooms",
  "Shopping malls", "Hospitals", "Clinics", "Hotels", "Resorts", "Restaurants", "Cafés", "Educational institutions",
  "Banks", "Financial institutions", "Co-working spaces", "Residential clubhouse interiors", "Government interiors",
  "Industrial offices", "Factory administration offices", "Renovation projects", "Commercial refurbishment",
] as const;

export const PROJECT_STAGES = [
  ["announced", "Announced"], ["planning", "Planning"], ["design", "Design"], ["tendering", "Tendering"],
  ["construction", "Construction"], ["interior_fit_out", "Interior fit-out"], ["renovation", "Renovation"],
  ["vendor_appointment_pending", "Vendor appointment pending"], ["completed", "Completed"], ["unknown", "Unknown"],
] as const;

export const SIZE_BANDS = [
  ["lt_5k", "Below 5,000 sq. ft."], ["5k_10k", "5,000–10,000 sq. ft."], ["10k_25k", "10,000–25,000 sq. ft."],
  ["25k_50k", "25,000–50,000 sq. ft."], ["50k_100k", "50,000–100,000 sq. ft."], ["gt_100k", "Above 100,000 sq. ft."],
  ["unknown", "Unknown"],
] as const;

export const RESEARCH_PERIODS = [
  ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["6m", "Last 6 months"],
  ["12m", "Last 12 months"], ["upcoming12m", "Upcoming 12 months"],
] as const;

export const PIPELINE_STAGES = [
  ["newly_discovered", "Newly Discovered"], ["research_pending", "Research Pending"],
  ["decision_maker_identified", "Decision Maker Identified"], ["contact_verified", "Contact Verified"],
  ["intro_email_sent", "Introduction Email Sent"], ["follow_up_required", "Follow-up Required"],
  ["meeting_scheduled", "Meeting Scheduled"], ["site_visit_scheduled", "Site Visit Scheduled"],
  ["boq_rfq_received", "BOQ / RFQ Received"], ["quotation_submitted", "Quotation Submitted"],
  ["technical_discussion", "Technical Discussion"], ["commercial_negotiation", "Commercial Negotiation"],
  ["project_awarded", "Project Awarded"], ["lost", "Lost"], ["on_hold", "On Hold"],
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number][0];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(PIPELINE_STAGES);

export const OPPORTUNITY_CLASSES = [
  ["CONFIRMED_REQUIREMENT", "Confirmed requirement"],
  ["POTENTIAL_OPPORTUNITY", "Potential opportunity"],
  ["UNVERIFIED_ANNOUNCEMENT", "Unverified announcement"],
] as const;

export const COMPANY_TYPES = [
  ["corporate_client", "Corporate client"], ["real_estate_developer", "Real estate developer"],
  ["property_owner", "Commercial property owner"], ["architecture_firm", "Architecture firm"],
  ["interior_design_firm", "Interior design firm"], ["pmc", "Project management consultant"],
  ["design_and_build", "Design-and-build company"], ["general_contractor", "General contractor"],
  ["epc_contractor", "EPC contractor"], ["facility_management", "Facility management"],
  ["retail_chain", "Retail chain"], ["hospital_chain", "Hospital chain"], ["hotel_group", "Hotel group"],
  ["bank", "Bank"], ["educational_institution", "Educational institution"], ["government", "Government"],
  ["other", "Other"],
] as const;

export const ROLE_GROUPS: Record<string, { label: string; titles: string[] }> = {
  project_management: { label: "Project management", titles: ["Project Director", "Head of Projects", "General Manager – Projects", "Senior Project Manager", "Project Manager", "Construction Head"] },
  procurement: { label: "Procurement", titles: ["Chief Procurement Officer", "Head of Procurement", "Procurement Manager", "Purchase Manager", "Project Procurement Manager", "Vendor Development Manager"] },
  corporate_facilities: { label: "Corporate & facilities", titles: ["Head of Administration", "Facilities Head", "Facility Manager", "Workplace Manager", "Head of Real Estate", "Corporate Services Head"] },
  design: { label: "Design", titles: ["Principal Architect", "Head of Design", "Interior Design Head", "Design Director", "Project Architect"] },
  pmc_contracting: { label: "PMC & contracting", titles: ["Project Director", "Business Development Head", "Operations Director", "Director – Design & Build", "Contracts Manager"] },
};

export const EMAIL_STATUS_LABEL: Record<string, string> = {
  verified: "Verified", invalid: "Invalid", catch_all: "Catch-all", unknown: "Unknown", pending: "Pending", not_checked: "Not checked",
};
export const PHONE_STATUS_LABEL: Record<string, string> = {
  official_company: "Official company number", public_professional: "Public professional number",
  unverified: "Unverified number", unavailable: "Unavailable",
};

export const ACTIVITY_TYPES = [
  ["phone_call", "Phone call"], ["email", "Email"], ["whatsapp", "WhatsApp contact"], ["linkedin", "LinkedIn outreach"],
  ["meeting", "Meeting"], ["site_visit", "Site visit"], ["boq_received", "BOQ received"],
  ["quotation_submitted", "Quotation submitted"], ["negotiation", "Negotiation"], ["tender_deadline", "Tender deadline"], ["other", "Other"],
] as const;

export const TENDER_CATEGORIES = [
  "Interior works", "Interior finishing", "Commercial fit-out", "Office renovation", "Furniture and joinery",
  "Civil finishing", "Ceiling and partition", "Flooring and painting", "Contractor empanelment", "Vendor registration",
  "Expression of Interest", "Request for Quotation", "Request for Proposal",
] as const;

export const ATTACHMENT_KINDS = [
  ["drawing", "Drawing"], ["boq", "BOQ"], ["tender_document", "Tender document"], ["photograph", "Photograph"],
  ["correspondence", "Client correspondence"], ["site_visit_report", "Site visit report"], ["quotation", "Quotation"], ["other", "Other"],
] as const;

export const DISCOVERY_KEYWORDS = [
  "new corporate office", "office expansion", "office relocation", "interior fit-out", "commercial interior tender",
  "interior contractor required", "interior execution", "design and build", "office renovation", "new retail outlet",
  "new hotel development", "hospital expansion", "interior contractor empanelment",
];

export function label(list: readonly (readonly [string, string])[], v?: string | null) {
  if (!v) return "—";
  return list.find((x) => x[0] === v)?.[1] ?? v.replace(/_/g, " ");
}
