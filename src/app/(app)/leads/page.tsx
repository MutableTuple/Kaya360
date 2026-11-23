"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { LeadTable } from "@/components/LeadTable";
import { EntityFormModal } from "@/components/forms";
import { useMe, canWrite } from "@/components/me";

export default function LeadsPage() {
  const [open, setOpen] = useState(false); const router = useRouter(); const { me } = useMe();
  return (
    <div>
      <PageHeader title="Lead Database" subtitle="Central CRM of every opportunity. Every change is stored in PostgreSQL with a full audit trail." actions={canWrite(me) && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add lead</button>} />
      <LeadTable />
      <EntityFormModal open={open} onClose={() => setOpen(false)} resource="leads" title="Add lead" onSaved={(r) => router.push(`/leads/${r.id}`)} />
    </div>
  );
}
