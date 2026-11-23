import { route, must, HttpError } from "@/lib/api";
import { runJobStep } from "@/lib/discovery/engine";
import { WRITE_ROLES } from "@/lib/constants";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Advance a running job by one time-slice. Called by the open discovery page and by the cron tick. */
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const job = must(await ctx.supabase.from("discovery_jobs").select("id,status").eq("id", id).maybeSingle());
  if (job.status !== "running") throw new HttpError(409, `Job is ${job.status.replace(/_/g, " ")}.`);
  return runJobStep(id, 40_000);
}, { roles: WRITE_ROLES, limit: 30 });
