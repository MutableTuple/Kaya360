import { z } from "zod";
import { route, body, must, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { missingForDiscovery } from "@/lib/discovery/engine";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => {
  const job = must(await ctx.supabase.from("discovery_jobs").select("*").eq("id", id).maybeSingle());
  const review = req.nextUrl.searchParams.get("review") ?? "pending";
  let q = ctx.supabase.from("discovery_results").select("*").eq("job_id", id).order("preview_score", { ascending: false, nullsFirst: false }).order("created_at").limit(500);
  if (review !== "all") q = q.eq("review_status", review);
  const { data: results, error } = await q;
  if (error) throw error;
  const { data: counts } = await ctx.supabase.from("discovery_results").select("review_status").eq("job_id", id).limit(5000);
  const tally: Record<string, number> = {};
  for (const r of counts ?? []) tally[r.review_status] = (tally[r.review_status] ?? 0) + 1;
  return { job, results, tally };
}, { limit: 600 });

export const PATCH = route<{ id: string }>(async (req, ctx, { id }) => {
  const { action } = z.object({ action: z.enum(["pause", "resume", "cancel", "retry"]) }).parse(await body(req));
  const job = must(await ctx.supabase.from("discovery_jobs").select("status,kind").eq("id", id).maybeSingle());
  const transitions: Record<string, string[]> = { pause: ["running", "queued"], resume: ["paused"], cancel: ["running", "paused", "queued", "needs_configuration"], retry: ["needs_configuration", "failed"] };
  if (!transitions[action].includes(job.status)) throw new HttpError(409, `Cannot ${action} a job that is ${job.status.replace(/_/g, " ")}.`);
  if (action === "resume" || action === "retry") {
    const missing = await missingForDiscovery(job.kind);
    if (missing.length) throw new HttpError(503, `Still missing configuration: ${missing.join("; ")}`, { code: "missing_configuration" });
  }
  const status = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "running";
  const patch: Record<string, unknown> = { status, lock_until: null };
  if (action === "cancel") patch.finished_at = new Date().toISOString();
  if (action === "retry") patch.started_at = new Date().toISOString();
  const { data, error } = await ctx.supabase.from("discovery_jobs").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return { job: data };
}, { roles: WRITE_ROLES });
