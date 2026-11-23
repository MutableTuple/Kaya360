import { route, HttpError } from "@/lib/api";

// DISABLED — Gmail / Google OAuth email sending is turned off (emails are only saved as drafts in the DB).
export const GET = route(async () => { throw new HttpError(503, "Email sending is turned off. Drafts are saved in the database only.", { code: "missing_configuration" }); });

/* Original code:
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { gmailAuthUrl } from "@/lib/integrations/gmail";

export const GET = route(async (_req, ctx) => NextResponse.redirect(await gmailAuthUrl(ctx.user.id)));
*/
