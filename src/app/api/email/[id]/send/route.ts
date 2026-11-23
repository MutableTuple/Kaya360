import { route, HttpError } from "@/lib/api";

// DISABLED — Gmail / Google OAuth email sending is turned off (emails are only saved as drafts in the DB).
export const POST = route(async () => { throw new HttpError(503, "Email sending is turned off. Drafts are saved in the database only.", { code: "missing_configuration" }); });

/* Original code:
import { route, must, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { gmailSend } from "@/lib/integrations/gmail";
import { unfilled } from "@/lib/templates";

/** The user's click on SEND is the explicit approval. Nothing is ever sent automatically. * /
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const db = ctx.supabase;
  const e = must(await db.from("email_logs").select("*").eq("id", id).maybeSingle());
  if (e.created_by !== ctx.user.id && !["administrator", "bd_manager"].includes(ctx.profile.role)) throw new HttpError(403, "You can only send your own drafts.");
  if (!["draft", "approved", "failed"].includes(e.status)) throw new HttpError(409, `This email is already ${e.status}.`);
  const missing = [...unfilled(e.subject), ...unfilled(e.body)];
  if (missing.length) throw new HttpError(400, `Fill in the placeholders before sending: ${missing.join(", ")}.`);
  const { data: acct } = await db.from("email_accounts").select("email,encrypted_refresh_token").eq("user_id", ctx.user.id).maybeSingle();
  if (!acct) throw new HttpError(503, "Connect your Gmail account in Email Centre before sending.", { code: "missing_configuration" });
  await db.from("email_logs").update({ status: "sending", approved_by: ctx.user.id, approved_at: new Date().toISOString() }).eq("id", id);
  try {
    const r = await gmailSend(acct, { to: e.to_email, cc: e.cc, subject: e.subject, body: e.body }, ctx.user.id);
    const { data } = await db.from("email_logs").update({ status: "sent", provider: "gmail", provider_message_id: r.id, provider_thread_id: r.threadId, sent_at: new Date().toISOString(), error: null }).eq("id", id).select("*").single();
    if (e.lead_id) {
      await db.from("lead_activities").insert({ lead_id: e.lead_id, kind: "email", summary: `Email sent to ${e.to_email}: ${e.subject}`, metadata: { email_log_id: id }, created_by: ctx.user.id });
      const { data: lead } = await db.from("leads").select("stage").eq("id", e.lead_id).single();
      const patch: Record<string, unknown> = { last_contact_date: new Date().toISOString() };
      if (lead && ["newly_discovered", "research_pending", "decision_maker_identified", "contact_verified"].includes(lead.stage)) patch.stage = "intro_email_sent";
      await db.from("leads").update(patch).eq("id", e.lead_id);
    }
    return { record: data, message: `Sent from ${acct.email}.` };
  } catch (err) {
    await db.from("email_logs").update({ status: "failed", error: (err as Error).message }).eq("id", id);
    throw err;
  }
}, { roles: WRITE_ROLES, limit: 30 });
*/
