import { z } from "zod";
import { route, body, HttpError, sanitize } from "@/lib/api";
import { ROLES } from "@/lib/constants";

const P = z.object({ role: z.enum(ROLES).optional(), is_active: z.boolean().optional(), full_name: z.string().min(2).max(120).optional(), designation: z.string().max(120).nullable().optional(), phone: z.string().max(40).nullable().optional() });

export const PATCH = route<{ id: string }>(async (req, ctx, { id }) => {
  const patch = P.parse(sanitize(await body(req)));
  const self = id === ctx.user.id;
  if ((patch.role || patch.is_active !== undefined) && ctx.profile.role !== "administrator") throw new HttpError(403, "Only administrators can change roles or deactivate users.");
  if (!self && ctx.profile.role !== "administrator") throw new HttpError(403, "You can only edit your own profile.");
  if (self && patch.is_active === false) throw new HttpError(400, "You cannot deactivate your own account.");
  const { data, error } = await ctx.supabase.from("profiles").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, "User not found.");
  return { record: data };
});
