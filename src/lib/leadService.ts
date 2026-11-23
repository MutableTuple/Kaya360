import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreLead, type ScoringWeights } from "./scoring";

/** Recalculate a lead's automatic score from the records currently in the database. */
export async function recomputeLeadScore(db: SupabaseClient, leadId: string) {
  const { data: lead, error } = await db.from("leads").select("id,project_id,company_id,primary_contact_id").eq("id", leadId).single();
  if (error) throw error;
  const [{ data: project }, { data: settings }] = await Promise.all([
    lead.project_id ? db.from("projects").select("*").eq("id", lead.project_id).single() : Promise.resolve({ data: null }),
    db.from("application_settings").select("value").eq("key", "scoring_weights").maybeSingle(),
  ]);
  const ors = [`id.eq.${lead.primary_contact_id ?? "00000000-0000-0000-0000-000000000000"}`];
  if (lead.project_id) ors.push(`project_id.eq.${lead.project_id}`);
  if (lead.company_id) ors.push(`company_id.eq.${lead.company_id}`);
  const { data: contacts } = await db.from("contacts").select("role_group,designation,email_verification_status,phone_status,direct_email,company_email").is("deleted_at", null).or(ors.join(","));
  const res = scoreLead(project, contacts ?? [], (settings?.value ?? {}) as Partial<ScoringWeights>);
  const { error: ue } = await db.from("leads").update({ score_auto: res.score, score_breakdown: res.items, scored_at: new Date().toISOString() }).eq("id", leadId);
  if (ue) throw ue;
  return res;
}

/** Recompute every lead linked to a project/company/contact after it changes. */
export async function recomputeRelated(db: SupabaseClient, f: { projectId?: string | null; companyId?: string | null }) {
  const ors: string[] = [];
  if (f.projectId) ors.push(`project_id.eq.${f.projectId}`);
  if (f.companyId) ors.push(`company_id.eq.${f.companyId}`);
  if (!ors.length) return 0;
  const { data } = await db.from("leads").select("id").is("deleted_at", null).or(ors.join(",")).limit(200);
  for (const l of data ?? []) await recomputeLeadScore(db, l.id);
  return data?.length ?? 0;
}

export async function syncNextFollowUp(db: SupabaseClient, leadId: string) {
  const { data } = await db.from("follow_ups").select("due_at").eq("lead_id", leadId).eq("status", "pending").order("due_at").limit(1);
  await db.from("leads").update({ next_follow_up: data?.[0]?.due_at ?? null }).eq("id", leadId);
}
