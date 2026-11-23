import { NextResponse } from "next/server";
import { route, HttpError } from "@/lib/api";
import { buildCsv, buildPdf, buildXlsx, EXPORT_COLUMNS } from "@/lib/export";
import { companyBranding, fetchAll } from "@/lib/exportData";
import { STAGE_LABEL } from "@/lib/constants";

export const maxDuration = 60;
const TITLES: Record<string, [string, string]> = {
  leads: ["leads", "Master Lead Database"], projects: ["projects", "Project Database"], companies: ["companies", "Company Database"],
  contacts: ["contacts", "Decision-Maker Database"], tenders: ["tenders", "Tender Tracker"], follow_ups: ["follow_ups", "Follow-up Report"], pipeline: ["leads", "Project Pipeline"],
};

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "leads"; const format = sp.get("format") ?? "xlsx";
  const t = TITLES[type]; if (!t) throw new HttpError(400, "Unknown export type.");
  if (!["xlsx", "csv", "pdf"].includes(format)) throw new HttpError(400, "Format must be xlsx, csv or pdf.");
  const rows = await fetchAll(ctx.supabase, t[0], sp);
  const cols = EXPORT_COLUMNS[type];
  const b = await companyBranding(ctx.supabase);
  const range = [sp.get("from"), sp.get("to")].filter(Boolean).join(" to ");
  const stamp = new Date().toISOString().slice(0, 10);
  const fname = `kaya-${type}-${stamp}.${format}`;
  await ctx.supabase.from("audit_logs").insert({ table_name: t[0], action: "EXPORT", new_data: { type, format, rows: rows.length, filters: Object.fromEntries(sp) }, actor_id: ctx.user.id, actor_email: ctx.user.email }).then(() => null, () => null);
  let buf: Buffer | string; let mime: string;
  if (format === "csv") { buf = buildCsv(cols, rows); mime = "text/csv; charset=utf-8"; }
  else if (format === "xlsx") {
    const sheets = [{ name: t[1], title: t[1], subtitle: range || undefined, cols, rows }];
    if (type === "pipeline") {
      for (const [stage, label] of Object.entries(STAGE_LABEL)) { const r = rows.filter((x) => x.stage === stage); if (r.length) sheets.push({ name: label.replace(/[\\/?*[\]:]/g, "-"), title: `${t[1]} — ${label}`, subtitle: undefined, cols, rows: r }); }
    }
    buf = await buildXlsx(sheets, b.company); mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else {
    const pdfCols = cols.slice(0, 9);
    buf = buildPdf({ title: t[1], subtitle: `${rows.length} record(s)${range ? " · " + range : ""}`, ...b, landscape: true, sections: [{ heading: t[1], table: { cols: pdfCols, rows } }] });
    mime = "application/pdf";
  }
  return new NextResponse(new Uint8Array(typeof buf === "string" ? Buffer.from(buf, "utf8") : buf), { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${fname}"`, "Cache-Control": "no-store" } });
}, { limit: 20 });
