import { NextResponse } from "next/server";
import { route, must, HttpError } from "@/lib/api";
import { MANAGER_ROLES } from "@/lib/constants";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => {
  const a = must(await ctx.supabase.from("project_attachments").select("storage_path,file_name").eq("id", id).maybeSingle());
  const { data, error } = await ctx.supabase.storage.from("attachments").createSignedUrl(a.storage_path, 300, { download: a.file_name });
  if (error) throw new HttpError(500, error.message);
  return NextResponse.redirect(data.signedUrl);
});

export const DELETE = route<{ id: string }>(async (req, ctx, { id }) => {
  if (req.nextUrl.searchParams.get("confirm") !== "1") throw new HttpError(400, "Deletion must be confirmed.");
  const a = must(await ctx.supabase.from("project_attachments").select("storage_path").eq("id", id).maybeSingle());
  const { error } = await ctx.supabase.from("project_attachments").delete().eq("id", id);
  if (error) throw error;
  await ctx.supabase.storage.from("attachments").remove([a.storage_path]);
  return { ok: true };
}, { roles: MANAGER_ROLES });
