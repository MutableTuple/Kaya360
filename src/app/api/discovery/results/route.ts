import { z } from "zod";
import { route, body, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { saveContactResult, saveProjectResult, saveTenderResult } from "@/lib/discovery/save";
import { recomputeRelated } from "@/lib/leadService";

const A = z.object({ action: z.enum(["save", "reject", "restore", "merge_source"]), ids: z.array(z.string().uuid()).min(1).max(200) });

export const maxDuration = 60;

export const POST = route(async (req, ctx) => {
  const { action, ids } = A.parse(await body(req));
  const db = ctx.supabase;
  const { data: rows, error } = await db.from("discovery_results").select("*, job:discovery_jobs(params,kind)").in("id", ids);
  if (error) throw error;
  if (!rows?.length) throw new HttpError(404, "No matching results.");
  const out: { id: string; ok: boolean; message: string; record?: string }[] = [];
  for (const r of rows) {
    try {
      if (action === "reject" || action === "restore") {
        await db.from("discovery_results").update({ review_status: action === "reject" ? "rejected" : "pending", reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() }).eq("id", r.id);
        out.push({ id: r.id, ok: true, message: action === "reject" ? "Rejected" : "Restored" }); continue;
      }
      if (action === "merge_source") {
        if (r.result_type !== "project" || !r.duplicate_of) throw new HttpError(400, "Only duplicate project results can be merged as a source.");
        await db.from("lead_sources").insert({ project_id: r.duplicate_of, url: r.source_url, title: r.source_title, excerpt: r.payload?.evidence_quote ?? r.payload?.snippet ?? null, source_type: "web", created_by: ctx.user.id });
        await db.from("projects").update({ last_researched_at: new Date().toISOString(), secondary_reference: r.source_url }).eq("id", r.duplicate_of);
        await db.from("discovery_results").update({ review_status: "saved", saved_record_id: r.duplicate_of, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() }).eq("id", r.id);
        out.push({ id: r.id, ok: true, message: "Added as secondary source to existing project", record: r.duplicate_of }); continue;
      }
      if (r.review_status === "saved") { out.push({ id: r.id, ok: true, message: "Already saved", record: r.saved_record_id }); continue; }
      if (r.review_status === "duplicate") throw new HttpError(409, "This result duplicates an existing record. Use “Add as source” instead.");
      let recordId: string | null = null;
      if (r.result_type === "project") recordId = (await saveProjectResult(db, r, ctx.user.id)).projectId;
      else if (r.result_type === "tender") recordId = (await saveTenderResult(db, r, ctx.user.id)).tenderId;
      else {
        const params = r.job?.params ?? {};
        recordId = await saveContactResult(db, r, params.companyId ?? null, params.projectId ?? null, ctx.user.id);
        if (!recordId) throw new HttpError(409, "Contact already exists for this company.");
        await recomputeRelated(db, { companyId: params.companyId, projectId: params.projectId });
      }
      await db.from("discovery_results").update({ review_status: "saved", saved_record_id: recordId, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() }).eq("id", r.id);
      out.push({ id: r.id, ok: true, message: "Saved", record: recordId ?? undefined });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.code === "23505" ? "Duplicate — a matching record already exists." : err.message ?? "Failed";
      if (err.code === "23505") await db.from("discovery_results").update({ review_status: "duplicate", duplicate_reason: msg }).eq("id", r.id);
      out.push({ id: r.id, ok: false, message: msg });
    }
  }
  return { results: out, saved: out.filter((x) => x.ok).length, failed: out.filter((x) => !x.ok).length };
}, { roles: WRITE_ROLES, limit: 60 });
