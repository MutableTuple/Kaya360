import { route, body, sanitize } from "@/lib/api";
import { createJob } from "@/lib/discovery/engine";
import { WRITE_ROLES } from "@/lib/constants";
import { DiscoverySchema } from "@/lib/discovery/schema";

export const POST = route(async (req, ctx) => {
  const p = DiscoverySchema.parse(sanitize(await body(req)));
  const { data: lg } = await ctx.supabase.from("application_settings").select("value").eq("key", "lead_generation").maybeSingle();
  const cap = Number((lg?.value as { max_queries_per_job?: number } | undefined)?.max_queries_per_job ?? 24);
  const { kind, trigger, ...params } = p;
  const { job, missing } = await createJob(ctx.supabase, kind, { ...params, maxQueries: Math.min(params.maxQueries ?? cap, cap) }, ctx.user.id, trigger);
  return { job, missing };
}, { roles: WRITE_ROLES, limit: 20 });
