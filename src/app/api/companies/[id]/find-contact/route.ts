import { route } from "@/lib/api";
import { enrichCompany } from "@/lib/contactFinder";

export const maxDuration = 60;

/** Reads the company's own website and fills its empty official email / phone. */
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const found = await enrichCompany(ctx.supabase, id, { searchIfNoWebsite: true });
  return { ok: true, found };
}, { roles: ["administrator", "bd_manager", "sales_executive", "researcher"], limit: 30 });
