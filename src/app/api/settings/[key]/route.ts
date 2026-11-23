import { z } from "zod";
import { route, body, HttpError, sanitize } from "@/lib/api";

const n = (min: number, max: number) => z.coerce.number().min(min).max(max);
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  company: z.object({ name: z.string().min(2).max(200), website: z.string().max(300), logo_url: z.string().max(1000).nullable().optional(), address: z.string().max(1000).optional(), introduction: z.string().max(3000), services: z.array(z.string().max(120)).max(40), target_markets: z.array(z.string().max(80)).max(20), preferred_categories: z.array(z.string().max(80)).max(40) }),
  lead_generation: z.object({ preferred_states: z.array(z.string()).max(40), preferred_cities: z.array(z.string()).max(100), project_sizes: z.array(z.string()).max(10), max_queries_per_job: n(1, 100), max_pages_per_query: n(1, 10), monthly_api_budget_usd: n(0, 100000) }),
  scoring_weights: z.object({ confirmed_project: n(0, 50), confirmed_interior_requirement: n(0, 50), decision_maker: n(0, 50), verified_contact: n(0, 50), priority_region: n(0, 50), external_contractor_potential: n(0, 50), execution_readiness: n(0, 50) })
    .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, "Scoring weights must add up to exactly 100"),
  automation: z.object({ enabled: z.boolean(), queries_per_run: n(1, 60), categories: z.array(z.string()).max(30), notify_roles: z.array(z.string()).max(5),
    geography: z.object({ region: z.enum(["all", "west", "north", "states", "cities"]), states: z.array(z.string()).max(40), cities: z.array(z.string()).max(100) }),
    daily: z.object({ discover_projects: z.boolean(), discover_tenders: z.boolean(), max_jobs: n(0, 10) }), weekly: z.object({ refresh_hot_leads: z.boolean(), deadline_check: z.boolean(), report: z.boolean() }), monthly: z.object({ performance_report: z.boolean(), inactive_leads: z.boolean() }) }),
  search_providers: z.object({ order: z.array(z.enum(["serper"])).min(1).max(1) }),
  usage_limits: z.record(z.string(), n(0, 10000000)),
};

export const PUT = route<{ key: string }>(async (req, ctx, { key }) => {
  const schema = SCHEMAS[key];
  if (!schema) throw new HttpError(404, "Unknown setting.");
  const value = schema.parse(sanitize(await body(req)));
  const { error } = await ctx.supabase.from("application_settings").upsert({ key, value, updated_by: ctx.user.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true, value };
}, { roles: ["administrator"] });
