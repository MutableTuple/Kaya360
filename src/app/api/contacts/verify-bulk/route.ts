import { z } from "zod";
import { route, body } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { verifyContact } from "@/lib/verifyService";

export const maxDuration = 60;

/** Sequential bulk verification (providers' single-check APIs; max 50 per request to stay within time limits). */
export const POST = route(async (req, ctx) => {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(await body(req));
  const out: { id: string; ok: boolean; status?: string; email?: string; error?: string }[] = [];
  const started = Date.now();
  for (const id of ids) {
    if (Date.now() - started > 50_000) { out.push({ id, ok: false, error: "Not processed — time limit reached; run again for remaining contacts." }); continue; }
    try { const r = await verifyContact(ctx.supabase, id, ctx.user.id); out.push({ id, ok: true, status: r.status, email: r.email }); }
    catch (e) {
      out.push({ id, ok: false, error: (e as Error).message });
      if ((e as { status?: number }).status === 503 || (e as { status?: number }).status === 402) break;
    }
  }
  return { results: out, verified: out.filter((r) => r.status === "verified").length, processed: out.filter((r) => r.ok).length };
}, { roles: WRITE_ROLES, limit: 10 });
