import { z } from "zod";
import { route, body, sanitize, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";

const D = z.object({
  id: z.string().uuid().optional(), to_email: z.string().email(), cc: z.string().max(1000).optional().nullable(),
  subject: z.string().min(2).max(500), body: z.string().min(5).max(50000), contact_id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(), lead_id: z.string().uuid().optional().nullable(), template_id: z.string().uuid().optional().nullable(),
});

export const POST = route(async (req, ctx) => {
  const d = D.parse(sanitize(await body(req)));
  if (d.cc && d.cc.split(",").some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim()))) throw new HttpError(400, "CC must be a comma-separated list of email addresses.");
  const { id, ...row } = d;
  const q = id
    ? ctx.supabase.from("email_logs").update({ ...row, status: "draft" }).eq("id", id).in("status", ["draft", "failed", "approved"]).select("*").maybeSingle()
    : ctx.supabase.from("email_logs").insert({ ...row, status: "draft", created_by: ctx.user.id }).select("*").single();
  const { data, error } = await q;
  if (error) throw error;
  if (!data) throw new HttpError(409, "Only drafts can be edited.");
  return { record: data };
}, { roles: WRITE_ROLES });
