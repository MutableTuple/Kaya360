import { route, HttpError } from "@/lib/api";

// DISABLED — Gmail / Google OAuth email sending is turned off (emails are only saved as drafts in the DB).
export const GET = route(async () => { throw new HttpError(503, "Email sending is turned off. Drafts are saved in the database only.", { code: "missing_configuration" }); });

/* Original code:
import { NextResponse, type NextRequest } from "next/server";
import { getCtx, errorResponse } from "@/lib/api";
import { exchangeCode, readState } from "@/lib/integrations/gmail";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCtx();
    const sp = req.nextUrl.searchParams;
    if (sp.get("error")) return NextResponse.redirect(`${env.appUrl()}/email?gmail=denied`);
    if (readState(sp.get("state") ?? "") !== ctx.user.id) throw new Error("OAuth state does not match the signed-in user.");
    const r = await exchangeCode(sp.get("code") ?? "");
    const { error } = await ctx.supabase.from("email_accounts").upsert({ user_id: ctx.user.id, provider: "gmail", email: r.email, encrypted_refresh_token: r.encryptedRefresh, scopes: r.scopes, connected_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
    if (error) throw error;
    return NextResponse.redirect(`${env.appUrl()}/email?gmail=connected`);
  } catch (e) {
    return errorResponse(e);
  }
}
*/
