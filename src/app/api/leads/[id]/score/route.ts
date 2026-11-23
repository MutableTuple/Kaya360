import { route } from "@/lib/api";
import { recomputeLeadScore } from "@/lib/leadService";
import { WRITE_ROLES } from "@/lib/constants";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => ({ result: await recomputeLeadScore(ctx.supabase, id) }), { roles: WRITE_ROLES });
