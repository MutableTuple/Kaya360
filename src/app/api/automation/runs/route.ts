import { route } from "@/lib/api";
import { MANAGER_ROLES } from "@/lib/constants";

export const GET = route(async (_req, ctx) => {
  const { data, error } = await ctx.supabase.from("scheduled_job_runs").select("*").order("started_at", { ascending: false }).limit(30);
  if (error) throw error;
  return { rows: data };
}, { roles: MANAGER_ROLES });
