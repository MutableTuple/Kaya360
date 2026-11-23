import { z } from "zod";
import { route, HttpError, body } from "@/lib/api";
import { resource } from "@/lib/listQuery";
import { WRITE_ROLES, MANAGER_ROLES } from "@/lib/constants";
import { recomputeLeadScore } from "@/lib/leadService";

const Bulk = z.object({
  action: z.enum(["delete", "restore", "archive", "unarchive", "assign", "stage", "rescore", "hard_delete"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
  value: z.string().optional().nullable(),
});

export const POST = route<{ resource: string }>(async (req, ctx, { resource: name }) => {
  const def = resource(name);
  if (!WRITE_ROLES.includes(ctx.profile.role)) throw new HttpError(403, "Your role cannot modify records.");
  const { action, ids, value } = Bulk.parse(await body(req));
  const db = ctx.supabase.from(def.table);
  let res;
  switch (action) {
    case "delete": if (!def.softDelete) throw new HttpError(400, "Not supported."); res = await db.update({ deleted_at: new Date().toISOString() }).in("id", ids).select("id"); break;
    case "restore": res = await db.update({ deleted_at: null }).in("id", ids).select("id"); break;
    case "hard_delete": if (!MANAGER_ROLES.includes(ctx.profile.role)) throw new HttpError(403, "Managers only."); res = await db.delete().in("id", ids).select("id"); break;
    case "archive": if (def.table !== "leads") throw new HttpError(400, "Only leads can be archived."); res = await db.update({ archived_at: new Date().toISOString() }).in("id", ids).select("id"); break;
    case "unarchive": res = await db.update({ archived_at: null }).in("id", ids).select("id"); break;
    case "assign": if (def.table !== "leads") throw new HttpError(400, "Only leads can be assigned."); res = await db.update({ assigned_to: value || null }).in("id", ids).select("id"); break;
    case "stage": if (def.table !== "leads" || !value) throw new HttpError(400, "Choose a stage."); res = await db.update({ stage: value }).in("id", ids).select("id"); break;
    case "rescore": if (def.table !== "leads") throw new HttpError(400, "Only leads are scored."); for (const id of ids) await recomputeLeadScore(ctx.supabase, id); return { ok: true, affected: ids.length };
  }
  if (res.error) throw res.error;
  return { ok: true, affected: res.data?.length ?? 0, requested: ids.length };
}, { limit: 60 });
