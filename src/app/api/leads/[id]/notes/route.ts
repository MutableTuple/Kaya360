import { z } from "zod";
import { route, body, sanitize } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";

const N = z.object({ summary: z.string().min(1).max(5000), kind: z.enum(["note", "call", "meeting", "email", "site_visit"]).default("note") });

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const { summary, kind } = N.parse(sanitize(await body(req)));
  const { data, error } = await ctx.supabase.from("lead_activities").insert({ lead_id: id, kind, summary, created_by: ctx.user.id }).select("*").single();
  if (error) throw error;
  if (kind !== "note") await ctx.supabase.from("leads").update({ last_contact_date: new Date().toISOString() }).eq("id", id);
  return { record: data };
}, { roles: WRITE_ROLES });
