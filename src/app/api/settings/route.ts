import { route } from "@/lib/api";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, ctx) => {
  const { data, error } = await ctx.supabase.from("application_settings").select("key,value,updated_at");
  if (error) throw error;
  return { settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])), profile: ctx.profile };
});
