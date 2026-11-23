import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildXlsx, buildCsv, buildPdf, EXPORT_COLUMNS } from "@/lib/export";

const rows = [{ lead_code: "LD-1", project_name: "Tower A", company_name: "=HYPERLINK(\"x\")", city: "Pune", score: 82, estimated_value: 12500000, next_follow_up: "2026-12-01T05:30:00Z", stage: "quotation_submitted" }];
describe("exports", () => {
  it("creates a real workbook with branding, headers and typed cells", async () => {
    const buf = await buildXlsx([{ name: "Leads", title: "Master Lead Database", cols: EXPORT_COLUMNS.leads, rows }], "KAYA INTERIORS PRIVATE LIMITED");
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Leads")!;
    expect(ws.getCell(1, 1).value).toBe("KAYA INTERIORS PRIVATE LIMITED");
    expect(ws.getRow(4).getCell(1).value).toBe("Lead ID");
    const scoreCol = EXPORT_COLUMNS.leads.findIndex((c) => c.key === "score") + 1;
    expect(ws.getRow(5).getCell(scoreCol).value).toBe(82);
  });
  it("CSV escapes and neutralises formulas", () => {
    const csv = buildCsv(EXPORT_COLUMNS.leads, rows);
    expect(csv.startsWith("﻿Lead ID,")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("quotation submitted");
  });
  it("PDF renders", () => {
    const pdf = buildPdf({ title: "Hot Lead Report", company: "KAYA INTERIORS PRIVATE LIMITED", website: "www.kayainteriors.in", sections: [{ heading: "Leads", table: { cols: EXPORT_COLUMNS.leads.slice(0, 6), rows } }, { heading: "Summary", kv: [["Total", "1"]], paragraph: "Value ₹1.25 Cr — confirmed." }] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
