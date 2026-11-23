// Lead scoring engine (0–100). Pure and deterministic so it can be unit tested.
// Principle: points are only awarded for evidence present in the record.
// Missing or unknown information always scores 0 for that criterion.
import { isPriorityRegion, regionOf } from "./geo";

export interface ScoringWeights {
  confirmed_project: number; confirmed_interior_requirement: number; decision_maker: number;
  verified_contact: number; priority_region: number; external_contractor_potential: number; execution_readiness: number;
}
export const DEFAULT_WEIGHTS: ScoringWeights = {
  confirmed_project: 25, confirmed_interior_requirement: 20, decision_maker: 15, verified_contact: 15,
  priority_region: 10, external_contractor_potential: 10, execution_readiness: 5,
};

export interface ScoringProject {
  opportunity_class?: string | null; current_stage?: string | null; primary_source_url?: string | null;
  verification_status?: string | null; state?: string | null; city?: string | null;
  contractor_appointment_status?: string | null; interior_commencement?: string | null;
  req_civil_finishing?: boolean | null; req_furniture?: boolean | null; req_flooring?: boolean | null;
  req_ceiling_partition?: boolean | null; req_carpentry_joinery?: boolean | null; req_renovation?: boolean | null; req_mep?: boolean | null;
}
export interface ScoringContact {
  role_group?: string | null; designation?: string | null; email_verification_status?: string | null;
  phone_status?: string | null; direct_email?: string | null; company_email?: string | null;
}
export interface ScoreItem { key: keyof ScoringWeights; label: string; max: number; points: number; reason: string }
export interface ScoreResult { score: number; classification: "hot" | "warm" | "potential" | "low"; items: ScoreItem[] }

const ACTIVE_STAGES = ["planning", "design", "tendering", "construction", "interior_fit_out", "renovation", "vendor_appointment_pending"];
const READY_STAGES = ["tendering", "interior_fit_out", "vendor_appointment_pending", "renovation"];
const RELEVANT_GROUPS = ["project_management", "procurement", "corporate_facilities", "design", "pmc_contracting"];

export function classify(score: number): ScoreResult["classification"] {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "potential";
  return "low";
}

function scaled(points: number, defaultMax: number, weight: number) {
  return Math.round((points / defaultMax) * weight);
}

export function scoreLead(project: ScoringProject | null, contacts: ScoringContact[], weights: Partial<ScoringWeights> = {}, now = new Date()): ScoreResult {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const items: ScoreItem[] = [];
  const p = project ?? {};
  const hasSource = !!p.primary_source_url;

  // 1. Confirmed upcoming or ongoing project
  {
    let pts = 0; let reason = "No sourced evidence that the project is upcoming or ongoing.";
    if (hasSource && p.current_stage && ACTIVE_STAGES.includes(p.current_stage) && p.opportunity_class !== "UNVERIFIED_ANNOUNCEMENT") {
      pts = 25; reason = `Source-backed project at “${p.current_stage.replace(/_/g, " ")}” stage.`;
    } else if (hasSource && p.current_stage === "announced" && p.opportunity_class !== "UNVERIFIED_ANNOUNCEMENT") {
      pts = 12; reason = "Announced with a source, but no evidence yet of planning/construction progress.";
    } else if (hasSource) {
      reason = "Source exists but the announcement is unverified or the stage is unknown.";
    }
    items.push({ key: "confirmed_project", label: "Confirmed upcoming or ongoing project", max: w.confirmed_project, points: scaled(pts, 25, w.confirmed_project), reason });
  }

  // 2. Confirmed interior execution requirement
  {
    const reqs = [p.req_civil_finishing, p.req_furniture, p.req_flooring, p.req_ceiling_partition, p.req_carpentry_joinery, p.req_renovation, p.req_mep].filter((x) => x === true).length;
    let pts = 0; let reason = "No source confirms an interior execution requirement.";
    if (p.opportunity_class === "CONFIRMED_REQUIREMENT") { pts = 20; reason = "Source confirms an interior execution / contractor requirement."; }
    else if (p.opportunity_class === "POTENTIAL_OPPORTUNITY" && reqs > 0) { pts = 8; reason = `Potential opportunity with ${reqs} identified work package(s); requirement not yet confirmed.`; }
    items.push({ key: "confirmed_interior_requirement", label: "Confirmed interior execution requirement", max: w.confirmed_interior_requirement, points: scaled(pts, 20, w.confirmed_interior_requirement), reason });
  }

  // 3. Relevant decision-maker identified
  {
    const relevant = contacts.filter((c) => c.role_group && RELEVANT_GROUPS.includes(c.role_group) && c.designation);
    let pts = 0; let reason = "No decision-maker linked to this lead.";
    if (relevant.length) { pts = 15; reason = `${relevant.length} relevant decision-maker(s): ${relevant.slice(0, 2).map((c) => c.designation).join(", ")}.`; }
    else if (contacts.length) { pts = 5; reason = "Contact(s) linked, but role relevance is not established."; }
    items.push({ key: "decision_maker", label: "Relevant decision-maker identified", max: w.decision_maker, points: scaled(pts, 15, w.decision_maker), reason });
  }

  // 4. Verified business contact
  {
    let pts = 0; let reason = "No contact detail has been verified by a provider.";
    const verified = contacts.some((c) => c.email_verification_status === "verified");
    const catchAll = contacts.some((c) => c.email_verification_status === "catch_all");
    const officialPhone = contacts.some((c) => c.phone_status === "official_company" || c.phone_status === "public_professional");
    if (verified) { pts = 15; reason = "At least one email verified by a verification provider."; }
    else {
      if (catchAll) { pts += 5; reason = "Email domain is catch-all (deliverability cannot be confirmed)."; }
      if (officialPhone) { pts += 5; reason = (pts > 5 ? reason + " " : "") + "Official/public professional phone number on record."; }
    }
    items.push({ key: "verified_contact", label: "Verified business contact", max: w.verified_contact, points: scaled(Math.min(15, pts), 15, w.verified_contact), reason });
  }

  // 5. West or North India
  {
    const pr = isPriorityRegion(p.state, p.city);
    const r = regionOf(p.state, p.city);
    items.push({
      key: "priority_region", label: "West or North India location", max: w.priority_region,
      points: pr ? w.priority_region : 0,
      reason: pr ? `Located in ${r === "west" ? "West" : "North"} India priority market.` : p.state || p.city ? "Outside West/North priority markets." : "Location unknown.",
    });
  }

  // 6. External contractor appointment potential
  {
    let pts = 0; let reason = "Contractor appointment status unknown.";
    switch (p.contractor_appointment_status) {
      case "open": pts = 10; reason = "Contractor selection is open."; break;
      case "not_started": pts = 10; reason = "Contractor not yet appointed."; break;
      case "in_progress": pts = 6; reason = "Contractor selection in progress."; break;
      case "appointed": pts = 0; reason = "A contractor has already been appointed."; break;
    }
    items.push({ key: "external_contractor_potential", label: "External contractor appointment potential", max: w.external_contractor_potential, points: scaled(pts, 10, w.external_contractor_potential), reason });
  }

  // 7. Execution readiness
  {
    let pts = 0; let reason = "No evidence of near-term interior execution.";
    if (p.interior_commencement) {
      const d = new Date(p.interior_commencement);
      const days = (d.getTime() - now.getTime()) / 86_400_000;
      if (days >= -30 && days <= 183) { pts = 5; reason = "Interior works expected to commence within 6 months."; }
      else if (days > 183) reason = "Interior commencement is more than 6 months away.";
    } else if (p.current_stage && READY_STAGES.includes(p.current_stage) && hasSource) {
      pts = 5; reason = `Project is at “${p.current_stage.replace(/_/g, " ")}” stage.`;
    }
    items.push({ key: "execution_readiness", label: "Execution readiness", max: w.execution_readiness, points: scaled(pts, 5, w.execution_readiness), reason });
  }

  const total = Math.max(0, Math.min(100, items.reduce((s, i) => s + i.points, 0)));
  return { score: total, classification: classify(total), items };
}
