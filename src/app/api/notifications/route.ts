import { z } from "zod";
import { route, body } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx) => {
  const { data, error } = await ctx.supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(40);
  if (error) throw error;
  return { notifications: data, unread: (data ?? []).filter((n) => !n.read_at && n.user_id).length };
}, { limit: 240 });

export const POST = route(async (req, ctx) => {
  const { ids, all } = z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }).parse(await body(req));
  let q = ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  if (!all && ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw error;
  return { ok: true };
});
