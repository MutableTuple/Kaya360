"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/forms";
import { api, PageHeader, Badge, ScorePill, inr, fmtDate, human, useToast, DemoBadge, Confirm } from "@/components/ui";
import { PROJECT_CATEGORIES, PROJECT_STAGES, OPPORTUNITY_CLASSES, SIZE_BANDS, label } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, canWrite } from "@/components/me";

type Row = Record<string, any>;

export default function ProjectsPage() {
  const router = useRouter(); const [open, setOpen] = useState(false); const { me } = useMe(); const toast = useToast();
  const [del, setDel] = useState<{ ids: string[]; done: () => void } | null>(null);
  return (
    <div>
      <PageHeader title="All Projects" subtitle="Every discovered or manually added project, with source and verification status." actions={<>
        <a className="btn-secondary" href="/api/export/report?kind=opportunity">Opportunity report (PDF)</a>
        {canWrite(me) && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add project</button>}</>} />
      <DataTable<Row> resource="projects" exportType="projects" defaultSort="created_at" onRowClick={(r) => router.push(`/projects/${r.id}`)} selectable={canWrite(me)}
        columns={[
          { key: "project_code", header: "ID", render: (r) => <span className="font-mono text-xs">{r.project_code}</span> },
          { key: "name", header: "Project", sortable: true, render: (r) => <div className="max-w-[260px]"><div className="font-medium text-slate-800">{r.name} <DemoBadge show={r.is_demo} /></div><div className="text-xs text-slate-500">{r.client_name}</div></div> },
          { key: "category", header: "Category", sortable: true }, { key: "city", header: "City", sortable: true }, { key: "state", header: "State", sortable: true },
          { key: "area_sqft", header: "Area (sq ft)", sortable: true, render: (r) => r.area_sqft ? Number(r.area_sqft).toLocaleString("en-IN") : "—" },
          { key: "current_stage", header: "Stage", sortable: true, render: (r) => human(r.current_stage) },
          { key: "opportunity_class", header: "Classification", render: (r) => <Badge tone={r.opportunity_class}>{label(OPPORTUNITY_CLASSES, r.opportunity_class)}</Badge> },
          { key: "estimated_project_value", header: "Est. value", sortable: true, render: (r) => inr(r.estimated_project_value) },
          { key: "lead_score", header: "Score", sortable: true, render: (r) => <ScorePill score={r.lead_score} priority={r.lead_priority} /> },
          { key: "verification_status", header: "Verification", render: (r) => <Badge tone={r.verification_status}>{human(r.verification_status)}</Badge> },
          { key: "created_at", header: "Added", sortable: true, render: (r) => fmtDate(r.created_at) },
        ]}
        filters={[
          { key: "region", label: "Region", type: "select", options: [["west", "West India"], ["north", "North India"], ["south", "South India"], ["east", "East India"], ["central", "Central India"]] },
          { key: "state", label: "State", type: "select", options: STATES.map((s) => [s.name, s.name] as const) }, { key: "city", label: "City", type: "text" },
          { key: "category", label: "Category", type: "select", options: PROJECT_CATEGORIES.map((c) => [c, c] as const) }, { key: "stage", label: "Stage", type: "select", options: PROJECT_STAGES },
          { key: "opportunity_class", label: "Classification", type: "select", options: OPPORTUNITY_CLASSES }, { key: "size_band", label: "Size", type: "select", options: SIZE_BANDS },
          { key: "from", label: "Added from", type: "date" }, { key: "to", label: "Added to", type: "date" }, { key: "demo", label: "DEMO only", type: "bool" },
        ]}
        bulkActions={(ids, clear, reload) => <button className="btn-secondary btn-xs text-red-600" onClick={() => setDel({ ids, done: () => { clear(); reload(); } })}><Trash2 className="h-3.5 w-3.5" />Delete</button>} />
      <EntityFormModal open={open} onClose={() => setOpen(false)} resource="projects" title="Add project" onSaved={(r) => router.push(`/projects/${r.id}`)} />
      <Confirm open={!!del} title="Delete projects" message={`Soft-delete ${del?.ids.length} project(s)? This is logged in the audit trail.`} onClose={() => setDel(null)} onConfirm={async () => { try { await api("/api/r/projects/bulk", { method: "POST", json: { action: "delete", ids: del!.ids } }); toast("success", "Deleted."); del!.done(); } catch (e) { toast("error", (e as Error).message); } setDel(null); }} />
    </div>
  );
}
