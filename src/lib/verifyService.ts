import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./api";
import { verifyEmail } from "./integrations/verify";
import { recomputeRelated } from "./leadService";
import type { ProviderId } from "./integrations/registry";

/** Verify the contact's direct email (or company email if no direct one) and persist the result. */
export async function verifyContact(db: SupabaseClient, contactId: string, userId: string, which: "direct" | "company" | "auto" = "auto", provider?: ProviderId) {
  const { data: c, error } = await db.from("contacts").select("id,direct_email,company_email,company_id,project_id").eq("id", contactId).single();
  if (error) throw error;
  const email = which === "company" ? c.company_email : which === "direct" ? c.direct_email : c.direct_email ?? c.company_email;
  if (!email) throw new HttpError(400, "This contact has no email address to verify.");
  await db.from("contacts").update({ email_verification_status: "pending" }).eq("id", contactId);
  try {
    const r = await verifyEmail(email, provider, userId);
    await db.from("email_verifications").insert({ contact_id: contactId, email, provider: r.provider, status: r.status, raw_result: r.raw, confidence: r.confidence, response: r.response as object, checked_by: userId });
    await db.from("contacts").update({ email_verification_status: r.status, email_verified_at: new Date().toISOString(), email_verification_provider: r.provider, email_confidence: r.confidence, last_verified_at: new Date().toISOString() }).eq("id", contactId);
    await recomputeRelated(db, { companyId: c.company_id, projectId: c.project_id });
    return { ...r, response: undefined };
  } catch (e) {
    await db.from("contacts").update({ email_verification_status: "not_checked" }).eq("id", contactId);
    throw e;
  }
}
