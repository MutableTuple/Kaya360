"use client";
import { PageHeader } from "@/components/ui";
import { LeadTable } from "@/components/LeadTable";

export default function HotLeadsPage() {
  return (
    <div>
      <PageHeader title="Hot Leads" subtitle="Leads scoring 80–100. Scores are evidence-based: missing information never earns points." actions={<a className="btn-secondary" href="/api/export/report?kind=hot">Hot lead report (PDF)</a>} />
      <LeadTable fixedFilters={{ priority: "hot" }} />
    </div>
  );
}
