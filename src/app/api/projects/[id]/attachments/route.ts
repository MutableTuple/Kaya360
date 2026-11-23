import { route, HttpError } from "@/lib/api";
import { WRITE_ROLES, ATTACHMENT_KINDS } from "@/lib/constants";

const MAX = 25 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/(vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation)|vnd\.ms-excel|msword|zip|x-zip-compressed|acad|x-dwg|dxf)|text\/(csv|plain)|image\/vnd\.dwg)$/;

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "other");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  if (!ATTACHMENT_KINDS.some((k) => k[0] === kind)) throw new HttpError(400, "Unknown attachment type.");
  if (file.size > MAX) throw new HttpError(413, "Files must be 25 MB or smaller.");
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED.test(file.type) && !["dwg", "dxf", "pdf", "xlsx", "xls", "docx", "doc", "jpg", "jpeg", "png", "zip", "csv", "pptx"].includes(ext)) throw new HttpError(415, `File type ${file.type || ext} is not allowed.`);
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `projects/${id}/${Date.now()}-${safe}`;
  const up = await ctx.supabase.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw new HttpError(500, `Upload failed: ${up.error.message}`);
  const { data, error } = await ctx.supabase.from("project_attachments").insert({ project_id: id, kind, file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: ctx.user.id }).select("*").single();
  if (error) { await ctx.supabase.storage.from("attachments").remove([path]); throw error; }
  return { record: data };
}, { roles: WRITE_ROLES, limit: 30 });
