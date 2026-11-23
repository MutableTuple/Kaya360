import { z } from "zod";

const Geo = z.object({ scope: z.enum(["all", "west", "north", "states", "cities", "custom"]), states: z.array(z.string()).optional(), cities: z.array(z.string()).optional(), custom: z.string().max(500).optional() });
export const DiscoverySchema = z.object({
  kind: z.enum(["projects", "tenders", "decision_makers"]).default("projects"),
  geography: Geo.default({ scope: "west" }),
  categories: z.array(z.string().max(100)).max(30).default([]),
  stages: z.array(z.string().max(50)).max(10).default([]),
  period: z.enum(["7d", "30d", "90d", "6m", "12m", "upcoming12m"]).default("30d"),
  sizes: z.array(z.string()).max(10).default([]),
  keywords: z.array(z.string().max(120)).max(20).default([]),
  customQuery: z.string().max(300).optional(),
  maxQueries: z.number().int().min(1).max(100).optional(),
  companyId: z.string().uuid().optional(), companyName: z.string().max(300).optional(), companyDomain: z.string().max(200).optional(),
  roleGroups: z.array(z.string()).optional(), projectId: z.string().uuid().optional(),
  trigger: z.enum(["manual", "assistant"]).default("manual"),
});

