import { z } from "zod";
import { route, body } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { verifyContact } from "@/lib/verifyService";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = z.object({ which: z.enum(["direct", "company", "auto"]).default("auto"), provider: z.enum(["hunter"]).optional() }).parse(await body(req).catch(() => ({})));
  return { result: await verifyContact(ctx.supabase, id, ctx.user.id, b.which, b.provider) };
}, { roles: WRITE_ROLES, limit: 30 });
