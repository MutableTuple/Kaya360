"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/forms";
import { PageHeader, human, DemoBadge, ExternalLink } from "@/components/ui";
import { COMPANY_TYPES } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, canWrite } from "@/components/me";

type Row = Record<string, any>;

function Inner() {
  const router = useRouter(); const [open, setOpen] = useState(false); const { me } = useMe(); const sp = useSearchParams();
  return (
    <div>
      <PageHeader title="Companies" subtitle="Clients, developers, architects, PMCs, contractors and other organisations — deduplicated by name and website domain." actions={canWrite(me) && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add company</button>} />
      <DataTable<Row> resource="companies" exportType="companies" defaultSort="name" defaultDir="asc" onRowClick={(r) => router.push(`/companies/${r.id}`)} initialFilters={sp.get("type") ? { company_type: sp.get("type")! } : undefined}
        columns={[
          { key: "name", header: "Company", sortable: true, render: (r) => <div className="font-medium text-slate-800">{r.name} <DemoBadge show={r.is_demo} /></div> },
          { key: "company_type", header: "Type", sortable: true, render: (r) => human(r.company_type) }, { key: "industry", header: "Industry" },
          { key: "city", header: "City", sortable: true }, { key: "state", header: "State" },
          { key: "website", header: "Website", render: (r) => <span onClick={(e) => e.stopPropagation()}><ExternalLink href={r.website} /></span> },
          { key: "official_email", header: "Official email" }, { key: "official_phone", header: "Official phone" },
          { key: "project_count", header: "Projects", sortable: true }, { key: "contact_count", header: "Contacts", sortable: true },
        ]}
        filters={[{ key: "company_type", label: "Type", type: "select", options: COMPANY_TYPES }, { key: "state", label: "State", type: "select", options: STATES.map((s) => [s.name, s.name] as const) }, { key: "city", label: "City", type: "text" }, { key: "demo", label: "DEMO only", type: "bool" }]} />
      <EntityFormModal open={open} onClose={() => setOpen(false)} resource="companies" title="Add company" onSaved={(r) => router.push(`/companies/${r.id}`)} />
    </div>
  );
}
export default function CompaniesPage() { return <Suspense><Inner /></Suspense>; }
