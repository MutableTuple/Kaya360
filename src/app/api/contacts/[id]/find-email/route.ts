import { route, must, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { hunterEmailFinder } from "@/lib/integrations/verify";

/**
 * FIND BUSINESS EMAIL via Hunter Email Finder. The email is attached to the contact
 * ONLY when Hunter reports public sources for it. Pattern-only guesses are returned
 * for information and are never saved against the person.
 */
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const c = must(await ctx.supabase.from("v_contacts").select("id,full_name,company_domain,direct_email,company_id").eq("id", id).maybeSingle());
  if (!c.company_domain) throw new HttpError(400, "The contact's company needs a website before an email can be searched.");
  const parts = String(c.full_name).replace(/\[DEMO\]\s*/i, "").trim().split(/\s+/);
  if (parts.length < 2) throw new HttpError(400, "A first and last name are needed to search for an email.");
  const r = await hunterEmailFinder(c.company_domain, parts[0], parts[parts.length - 1], ctx.user.id);
  if (!r.email) return { found: false, message: "No email found by the provider." };
  if (!r.publiclySourced) return { found: false, suggestion: r.email, score: r.score, message: "The provider only inferred this address from the company's email pattern. It has not been attached to the contact. Verify it independently before use." };
  const { error } = await ctx.supabase.from("contacts").update({ direct_email: r.email, direct_email_source: `Hunter email finder; public sources: ${r.sources.slice(0, 3).map((s) => s.uri).join(", ")}`, email_confidence: r.score, email_verification_status: "not_checked" }).eq("id", id);
  if (error) throw error;
  for (const s of r.sources.slice(0, 3)) await ctx.supabase.from("lead_sources").insert({ contact_id: id, url: s.uri, source_type: "enrichment_api", title: "Public source (via Hunter)", created_by: ctx.user.id }).then(() => null, () => null);
  return { found: true, email: r.email, score: r.score, sources: r.sources, message: "Publicly sourced email saved. Run VERIFY EMAIL to confirm deliverability." };
}, { roles: WRITE_ROLES, limit: 30 });
