import { z } from "zod";
import { route, body, HttpError } from "@/lib/api";
import { PIPELINE_STAGES, WRITE_ROLES } from "@/lib/constants";

const S = z.object({ stage: z.enum(PIPELINE_STAGES.map((s) => s[0]) as [string, ...string[]]), position: z.number().int().min(0).optional(), lost_reason: z.string().max(2000).optional() });

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const { stage, position, lost_reason } = S.parse(await body(req));
  const patch: Record<string, unknown> = { stage, stage_position: position ?? 0 };
  if (stage === "lost" && lost_reason) patch.lost_reason = lost_reason;
  const { data, error } = await ctx.supabase.from("leads").update(patch).eq("id", id).select("id,stage,stage_position").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, "Lead not updated — it may not exist or your role cannot edit leads.");
  return { record: data };
}, { roles: WRITE_ROLES, limit: 300 });
