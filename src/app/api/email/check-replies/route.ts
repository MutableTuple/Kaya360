import { route, HttpError } from "@/lib/api";

// DISABLED — Gmail / Google OAuth email sending is turned off (emails are only saved as drafts in the DB).
export const POST = route(async () => { throw new HttpError(503, "Email sending is turned off. Drafts are saved in the database only.", { code: "missing_configuration" }); });

/* Original code:
import { route, HttpError } from "@/lib/api";
import { gmailThreadHasReply } from "@/lib/integrations/gmail";

export const maxDuration = 60;

export const POST = route(async (_req, ctx) => {
  if (process.env.GMAIL_TRACK_REPLIES !== "true") throw new HttpError(503, "Reply tracking is disabled. Set GMAIL_TRACK_REPLIES=true and reconnect Gmail to grant the metadata scope.", { code: "missing_configuration" });
  const { data: acct } = await ctx.supabase.from("email_accounts").select("email,encrypted_refresh_token").eq("user_id", ctx.user.id).maybeSingle();
  if (!acct) throw new HttpError(503, "Connect Gmail first.");
  const { data: sent } = await ctx.supabase.from("email_logs").select("id,provider_thread_id,lead_id").eq("created_by", ctx.user.id).eq("status", "sent").is("replied_at", null).not("provider_thread_id", "is", null).limit(40);
  let replies = 0;
  for (const e of sent ?? []) {
    if (await gmailThreadHasReply(acct, e.provider_thread_id!)) {
      replies++;
      await ctx.supabase.from("email_logs").update({ replied_at: new Date().toISOString() }).eq("id", e.id);
      if (e.lead_id) await ctx.supabase.from("lead_activities").insert({ lead_id: e.lead_id, kind: "email", summary: "Reply received (detected in Gmail thread)", created_by: ctx.user.id });
    }
  }
  return { checked: sent?.length ?? 0, replies };
});
*/
