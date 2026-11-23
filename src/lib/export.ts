import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface Col { key: string; header: string; width?: number; type?: "text" | "number" | "money" | "date" | "datetime" | "percent" }
const NAVY = "0E1E3D";

function fmt(v: unknown, t?: Col["type"]) {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (t === "date" && typeof v === "string") return v.slice(0, 10);
  if (t === "datetime" && typeof v === "string") return new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  if (t === "money" && v !== "") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (typeof v === "object") return JSON.stringify(v);
  const str = String(v);
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(str) ? str.replace(/_/g, " ") : str;
}

export async function buildXlsx(sheets: { name: string; title: string; subtitle?: string; cols: Col[]; rows: Record<string, unknown>[] }[], company: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company; wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
    ws.mergeCells(1, 1, 1, Math.max(1, s.cols.length));
    ws.getCell(1, 1).value = company; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF" + NAVY } };
    ws.mergeCells(2, 1, 2, Math.max(1, s.cols.length));
    ws.getCell(2, 1).value = `${s.title}${s.subtitle ? " — " + s.subtitle : ""} · Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · ${s.rows.length} record(s)`;
    ws.getCell(2, 1).font = { size: 10, color: { argb: "FF5B6475" } };
    const header = ws.getRow(4);
    s.cols.forEach((c, i) => {
      const cell = header.getCell(i + 1); cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + NAVY } };
      cell.alignment = { vertical: "middle", wrapText: true }; ws.getColumn(i + 1).width = c.width ?? Math.min(48, Math.max(12, c.header.length + 4));
    });
    header.height = 22;
    s.rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      s.cols.forEach((c, i) => {
        const v = r[c.key]; const cell = row.getCell(i + 1);
        if (c.type === "number" || c.type === "money") { cell.value = v == null || v === "" ? null : Number(v); if (c.type === "money") cell.numFmt = '"₹"#,##,##0'; }
        else if ((c.type === "date" || c.type === "datetime") && v) { const d = new Date(String(v)); cell.value = isNaN(d.getTime()) ? String(v) : d; cell.numFmt = c.type === "date" ? "dd-mmm-yyyy" : "dd-mmm-yyyy hh:mm"; }
        else cell.value = fmt(v, c.type);
        cell.alignment = { vertical: "top", wrapText: true };
        if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F5F9" } };
      });
    });
    if (s.cols.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + s.rows.length, column: s.cols.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(cols: Col[], rows: Record<string, unknown>[]) {
  const esc = (v: string) => {
    let s = v;
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(fmt(r[c.key], c.type === "money" ? "number" : c.type))).join(","));
  return "﻿" + lines.join("\r\n");
}

export interface PdfSection { heading: string; kv?: [string, string][]; table?: { cols: Col[]; rows: Record<string, unknown>[] }; paragraph?: string }

function pdfText(v: string) { return v.replace(/₹/g, "Rs. ").replace(/[^\x20-\x7E\n -ÿ]/g, (c) => ({ "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "..." }[c] ?? "")); }

export function buildPdf(o: { title: string; subtitle?: string; company: string; website?: string; sections: PdfSection[]; landscape?: boolean }) {
  const doc = new jsPDF({ orientation: o.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const header = () => {
    doc.setFillColor(14, 30, 61); doc.rect(0, 0, W, 54, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(pdfText(o.company), 36, 24);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(pdfText(o.website ?? ""), 36, 40);
    doc.text("Kaya Project Intelligence 360", W - 36, 24, { align: "right" });
  };
  header();
  let y = 84;
  doc.setTextColor(14, 30, 61); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(pdfText(o.title), 36, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90, 100, 117);
  doc.text(pdfText(`${o.subtitle ? o.subtitle + " · " : ""}Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`), 36, y); y += 22;
  const ensure = (h: number) => { if (y + h > H - 50) { doc.addPage(); header(); y = 80; } };
  for (const s of o.sections) {
    ensure(40);
    doc.setTextColor(14, 30, 61); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(pdfText(s.heading), 36, y); y += 6;
    doc.setDrawColor(200, 207, 220); doc.line(36, y, W - 36, y); y += 14;
    if (s.paragraph) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 44, 52);
      const lines = doc.splitTextToSize(pdfText(s.paragraph), W - 72) as string[];
      for (const l of lines) { ensure(14); doc.text(l, 36, y); y += 13; }
      y += 6;
    }
    if (s.kv?.length) {
      autoTable(doc, { startY: y, body: s.kv.map(([k, v]) => [pdfText(k), pdfText(v || "—")]), theme: "plain", styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 170, textColor: [90, 100, 117] } }, margin: { left: 36, right: 36 }, didDrawPage: () => header() });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    }
    if (s.table) {
      autoTable(doc, {
        startY: y, head: [s.table.cols.map((c) => pdfText(c.header))], body: s.table.rows.map((r) => s.table!.cols.map((c) => pdfText(fmt(r[c.key], c.type)))),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [14, 30, 61], textColor: 255 }, alternateRowStyles: { fillColor: [243, 245, 249] },
        margin: { left: 36, right: 36, top: 70 }, didDrawPage: () => header(),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 146, 160); doc.text(`Page ${i} of ${pages} · Confidential — ${pdfText(o.company)}`, W / 2, H - 20, { align: "center" }); }
  return Buffer.from(doc.output("arraybuffer"));
}

export const EXPORT_COLUMNS: Record<string, Col[]> = {
  leads: [
    { key: "lead_code", header: "Lead ID", width: 16 }, { key: "project_name", header: "Project", width: 36 }, { key: "company_name", header: "Company", width: 28 },
    { key: "city", header: "City" }, { key: "state", header: "State" }, { key: "category", header: "Project category", width: 22 }, { key: "project_stage", header: "Project stage" },
    { key: "contact_name", header: "Contact name", width: 22 }, { key: "contact_designation", header: "Designation", width: 22 }, { key: "contact_email", header: "Email", width: 28 },
    { key: "contact_email_status", header: "Email status" }, { key: "contact_phone", header: "Phone", width: 16 }, { key: "score", header: "Lead score", type: "number" },
    { key: "priority", header: "Priority" }, { key: "lead_source", header: "Lead source" }, { key: "stage", header: "Lead status", width: 22 }, { key: "assigned_name", header: "Assigned employee", width: 20 },
    { key: "last_contact_date", header: "Last contact", type: "date" }, { key: "next_follow_up", header: "Next follow-up", type: "datetime", width: 18 }, { key: "estimated_value", header: "Est. opportunity value", type: "money", width: 18 },
  ],
  projects: [
    { key: "project_code", header: "Project ID", width: 16 }, { key: "name", header: "Project name", width: 36 }, { key: "client_name", header: "Client", width: 26 }, { key: "category", header: "Category", width: 22 },
    { key: "city", header: "City" }, { key: "state", header: "State" }, { key: "locality", header: "Locality" }, { key: "area_sqft", header: "Area (sq ft)", type: "number" },
    { key: "current_stage", header: "Stage" }, { key: "opportunity_class", header: "Opportunity class", width: 24 }, { key: "estimated_project_value", header: "Est. project value", type: "money", width: 18 },
    { key: "estimated_interior_value", header: "Est. interior value", type: "money", width: 18 }, { key: "announcement_date", header: "Announced", type: "date" }, { key: "expected_completion", header: "Expected completion", type: "date" },
    { key: "contractor_appointment_status", header: "Contractor status" }, { key: "lead_score", header: "Lead score", type: "number" }, { key: "verification_status", header: "Verification" },
    { key: "primary_source_url", header: "Source URL", width: 40 }, { key: "last_researched_at", header: "Last researched", type: "date" },
  ],
  companies: [
    { key: "name", header: "Company", width: 32 }, { key: "company_type", header: "Type", width: 20 }, { key: "industry", header: "Industry" }, { key: "website", header: "Website", width: 28 },
    { key: "headquarters", header: "Headquarters" }, { key: "city", header: "City" }, { key: "state", header: "State" }, { key: "official_email", header: "Official email", width: 26 },
    { key: "official_phone", header: "Official phone" }, { key: "linkedin_url", header: "LinkedIn", width: 30 }, { key: "vendor_registration_url", header: "Vendor registration", width: 30 },
    { key: "project_count", header: "Projects", type: "number" }, { key: "contact_count", header: "Contacts", type: "number" }, { key: "research_date", header: "Research date", type: "date" },
  ],
  contacts: [
    { key: "contact_code", header: "Contact ID" }, { key: "full_name", header: "Full name", width: 24 }, { key: "designation", header: "Designation", width: 26 }, { key: "company_name", header: "Company", width: 26 },
    { key: "department", header: "Department" }, { key: "company_email", header: "Company email (generic)", width: 26 }, { key: "direct_email", header: "Direct professional email", width: 28 },
    { key: "email_verification_status", header: "Email verification" }, { key: "email_verification_provider", header: "Verified by" }, { key: "company_phone", header: "Official company phone" },
    { key: "professional_phone", header: "Professional phone" }, { key: "phone_status", header: "Phone status" }, { key: "linkedin_url", header: "LinkedIn", width: 30 },
    { key: "office_location", header: "Office" }, { key: "project_name", header: "Associated project", width: 26 }, { key: "source_url", header: "Source URL", width: 36 }, { key: "last_verified_at", header: "Last verified", type: "date" },
  ],
  tenders: [
    { key: "tender_code", header: "Tender ID" }, { key: "organisation", header: "Organisation", width: 28 }, { key: "title", header: "Tender title", width: 40 }, { key: "reference_number", header: "Reference no.", width: 22 },
    { key: "location", header: "Location" }, { key: "state", header: "State" }, { key: "category", header: "Category" }, { key: "estimated_value", header: "Estimated value", type: "money" },
    { key: "emd_amount", header: "EMD", type: "money" }, { key: "publication_date", header: "Published", type: "date" }, { key: "submission_deadline", header: "Submission deadline", type: "datetime", width: 18 },
    { key: "deadline_status", header: "Status" }, { key: "document_url", header: "Document URL", width: 34 }, { key: "submission_url", header: "Submission URL", width: 34 }, { key: "source_url", header: "Source", width: 34 }, { key: "last_verified_at", header: "Last verified", type: "date" },
  ],
  follow_ups: [
    { key: "due_at", header: "Due", type: "datetime", width: 18 }, { key: "activity_type", header: "Activity" }, { key: "title", header: "Title", width: 32 }, { key: "lead_title", header: "Lead", width: 28 },
    { key: "company_name", header: "Company", width: 24 }, { key: "contact_name", header: "Contact", width: 20 }, { key: "assigned_name", header: "Assigned", width: 18 }, { key: "status", header: "Status" },
    { key: "notes", header: "Notes", width: 40 }, { key: "next_action", header: "Next action", width: 30 },
  ],
};
EXPORT_COLUMNS.pipeline = EXPORT_COLUMNS.leads;
