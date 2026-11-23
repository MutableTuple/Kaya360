import { z } from "zod";
import { route, must, body } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { createJob } from "@/lib/discovery/engine";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = z.object({ roleGroups: z.array(z.string()).optional(), projectId: z.string().uuid().optional() }).parse(await body(req).catch(() => ({})));
  const co = must(await ctx.supabase.from("companies").select("id,name,domain").eq("id", id).maybeSingle());
  const { job, missing } = await createJob(ctx.supabase, "decision_makers", { geography: { scope: "all" }, categories: [], stages: [], period: "12m", sizes: [], keywords: [], companyId: co.id, companyName: co.name.replace(/\[DEMO\]\s*/i, ""), companyDomain: co.domain ?? undefined, roleGroups: b.roleGroups, projectId: b.projectId, maxQueries: 14 }, ctx.user.id);
  return { job, missing };
}, { roles: WRITE_ROLES, limit: 20 });
