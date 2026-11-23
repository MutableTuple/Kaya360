import { z } from "zod";
import { route, body, must, HttpError } from "@/lib/api";
import { renderTemplate } from "@/lib/templates";

/** Render a template against real records. Returns unfilled placeholders so the user can complete them. */
export const POST = route(async (req, ctx) => {
  const b = z.object({ template_id: z.string().uuid().optional().nullable(), contact_id: z.string().uuid().optional().nullable(), lead_id: z.string().uuid().optional().nullable() }).parse(await body(req));
  const db = ctx.supabase;
  const c = b.contact_id ? must(await db.from("v_contacts").select("*").eq("id", b.contact_id).maybeSingle()) : null;
  const l = b.lead_id ? must(await db.from("v_leads").select("*").eq("id", b.lead_id).maybeSingle()) : null;
  const t = b.template_id ? must(await db.from("email_templates").select("*").eq("id", b.template_id).maybeSingle()) : { subject: "", body: "" };
  const { data: s } = await db.from("application_settings").select("value").eq("key", "company").maybeSingle();
  const co = (s?.value ?? {}) as { introduction?: string; website?: string };
  const vars = {
    contact_name: c?.full_name?.replace(/\[DEMO\]\s*/i, "") ?? l?.contact_name ?? null, company_name: c?.company_name ?? l?.company_name ?? null,
    project_name: l?.project_name ?? c?.project_name ?? null, city: l?.city ?? c?.office_location ?? null,
    sender_name: ctx.profile.full_name, sender_designation: ctx.profile.designation, sender_phone: ctx.profile.phone, kaya_website: co.website ?? null, company_introduction: co.introduction ?? null,
  };
  const subject = renderTemplate(t.subject, vars); const text = renderTemplate(t.body, vars);
  const to = c?.direct_email ?? c?.company_email ?? l?.contact_email ?? null;
  if (b.contact_id && !to) throw new HttpError(400, "This contact has no email address. Use FIND BUSINESS EMAIL or add one first.");
  return { to, subject: subject.text, body: text.text, missing: [...new Set([...subject.missing, ...text.missing])], contact: c ? { id: c.id, name: c.full_name, status: c.email_verification_status, company_id: c.company_id } : null, lead_id: l?.id ?? null };
});
