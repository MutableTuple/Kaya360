import { route, HttpError } from "@/lib/api";
// import { getCredentials } from "@/lib/integrations/registry"; // Gmail disabled

export const GET = route(async (_req, ctx) => {
  const { data } = await ctx.supabase.from("email_accounts").select("email,provider,connected_at,scopes").eq("user_id", ctx.user.id).maybeSingle();
  return { account: data, oauthConfigured: false /* Gmail disabled: !!(await getCredentials("gmail")) */ };
});
export const DELETE = route(async (req, ctx) => {
  if (req.nextUrl.searchParams.get("confirm") !== "1") throw new HttpError(400, "Confirm disconnection.");
  const { error } = await ctx.supabase.from("email_accounts").delete().eq("user_id", ctx.user.id);
  if (error) throw error;
  return { ok: true };
});
