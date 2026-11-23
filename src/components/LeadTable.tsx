"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, UserPlus, RefreshCw } from "lucide-react";
import { DataTable, type Column, type FilterDef } from "./DataTable";
import { api, Badge, ScorePill, fmtDate, inr, human, useToast, DemoBadge, Confirm } from "./ui";
import { PIPELINE_STAGES, STAGE_LABEL, PROJECT_CATEGORIES, PROJECT_STAGES } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { loadTeam } from "./forms";
import { useMe, canWrite } from "./me";

type Row = Record<string, any>;

export const LEAD_COLUMNS: Column<Row>[] = [
  { key: "lead_code", header: "Lead ID", sortable: true, render: (r) => <span className="font-mono text-xs">{r.lead_code}</span> },
  { key: "project_name", header: "Project", sortable: true, render: (r) => <div className="max-w-[240px]"><div className="truncate font-medium text-slate-800">{r.project_name ?? r.title ?? "—"} <DemoBadge show={r.is_demo} /></div></div> },
  { key: "company_name", header: "Company", sortable: true },
  { key: "city", header: "City", sortable: true }, { key: "state", header: "State", sortable: true },
  { key: "category", header: "Category" }, { key: "project_stage", header: "Project stage", render: (r) => human(r.project_stage) },
  { key: "contact_name", header: "Contact", render: (r) => r.contact_name ? <div><div>{r.contact_name}</div><div className="text-xs text-slate-500">{r.contact_designation}</div></div> : <span className="text-xs text-slate-400">None</span> },
  { key: "contact_email", header: "Email", render: (r) => r.contact_email ? <div><div className="text-xs">{r.contact_email}</div><Badge tone={r.contact_email_status}>{human(r.contact_email_status)}</Badge></div> : "—" },
  { key: "contact_phone", header: "Phone", render: (r) => r.contact_phone ? <div className="text-xs">{r.contact_phone}<div className="text-slate-400">{human(r.contact_phone_status)}</div></div> : "—" },
  { key: "score", header: "Score", sortable: true, render: (r) => <ScorePill score={r.score} priority={r.priority} /> },
  { key: "priority", header: "Priority", render: (r) => <Badge tone={r.priority}>{human(r.priority)}</Badge> },
  { key: "lead_source", header: "Source", render: (r) => human(r.lead_source) },
  { key: "stage", header: "Lead status", sortable: true, render: (r) => <span className="text-xs">{STAGE_LABEL[r.stage]}</span> },
  { key: "assigned_name", header: "Assigned", render: (r) => r.assigned_name ?? <span className="text-xs text-slate-400">Unassigned</span> },
  { key: "last_contact_date", header: "Last contact", sortable: true, render: (r) => fmtDate(r.last_contact_date) },
  { key: "next_follow_up", header: "Next follow-up", sortable: true, render: (r) => <span className={r.next_follow_up && new Date(r.next_follow_up) < new Date() ? "font-medium text-red-700" : ""}>{fmtDate(r.next_follow_up, true)}</span> },
  { key: "estimated_value", header: "Est. value", sortable: true, render: (r) => inr(r.estimated_value) },
];

export function leadFilters(team: [string, string][]): FilterDef[] {
  return [
    { key: "region", label: "Region", type: "select", options: [["west", "West India"], ["north", "North India"], ["south", "South India"], ["east", "East India"], ["central", "Central India"]] },
    { key: "state", label: "State", type: "select", options: STATES.map((s) => [s.name, s.name] as const) }, { key: "city", label: "City", type: "text" },
    { key: "category", label: "Project type", type: "select", options: PROJECT_CATEGORIES.map((c) => [c, c] as const) },
    { key: "project_stage", label: "Project stage", type: "select", options: PROJECT_STAGES }, { key: "stage", label: "Lead status", type: "multiselect", options: PIPELINE_STAGES },
    { key: "priority", label: "Priority", type: "select", options: [["hot", "Hot (80+)"], ["warm", "Warm (60–79)"], ["potential", "Potential (40–59)"], ["low", "Low (<40)"]] },
    { key: "score_min", label: "Min score", type: "number" }, { key: "score_max", label: "Max score", type: "number" },
    { key: "has_contact", label: "Has contact", type: "bool" }, { key: "no_contact", label: "No contact", type: "bool" },
    { key: "email_status", label: "Email verification", type: "select", options: [["verified", "Verified"], ["invalid", "Invalid"], ["catch_all", "Catch-all"], ["unknown", "Unknown"], ["not_checked", "Not checked"]] },
    { key: "source", label: "Lead source", type: "select", options: [["ai_discovery", "AI discovery"], ["tender_discovery", "Tender discovery"], ["manual", "Manual"], ["referral", "Referral"], ["inbound", "Inbound"], ["import", "Import"], ["demo", "Demo"]] },
    { key: "assigned", label: "Assigned employee", type: "select", options: team }, { key: "discovered_from", label: "Discovered from", type: "date" }, { key: "discovered_to", label: "Discovered to", type: "date" },
    { key: "follow_from", label: "Follow-up from", type: "date" }, { key: "follow_to", label: "Follow-up to", type: "date" }, { key: "archived", label: "Show archived", type: "bool" }, { key: "demo", label: "DEMO only", type: "bool" },
  ];
}

export function LeadTable({ fixedFilters, toolbar, reloadKey }: { fixedFilters?: Record<string, string>; toolbar?: React.ReactNode; reloadKey?: number }) {
  const router = useRouter(); const toast = useToast(); const { me } = useMe();
  const [team, setTeam] = useState<[string, string][]>([]); const [confirm, setConfirm] = useState<{ ids: string[]; done: () => void } | null>(null);
  useEffect(() => { loadTeam().then((t) => setTeam(t.map((u) => [String(u.id), String(u.full_name ?? u.email)]))).catch(() => null); }, []);
  const bulk = async (action: string, ids: string[], value?: string | null) => { try { const r = await api<{ affected: number }>("/api/r/leads/bulk", { method: "POST", json: { action, ids, value } }); toast("success", `${r.affected} lead(s) updated.`); return true; } catch (e) { toast("error", (e as Error).message); return false; } };
  return (
    <>
      <DataTable resource="leads" columns={LEAD_COLUMNS} filters={leadFilters(team)} fixedFilters={fixedFilters} defaultSort="score" exportType="leads" reloadKey={reloadKey} toolbar={toolbar}
        onRowClick={(r) => router.push(`/leads/${r.id}`)} selectable={canWrite(me)} emptyTitle="No leads yet" emptyHint="Leads are created when you save discovery results, convert a tender, or add one manually."
        bulkActions={(ids, clear, reload) => (<>
          <select className="input w-auto py-1 text-xs" defaultValue="" onChange={async (e) => { if (e.target.value && await bulk("assign", ids, e.target.value === "_none" ? null : e.target.value)) { clear(); reload(); } e.target.value = ""; }}><option value="">Assign to…</option><option value="_none">Unassign</option>{team.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select className="input w-auto py-1 text-xs" defaultValue="" onChange={async (e) => { if (e.target.value && await bulk("stage", ids, e.target.value)) { clear(); reload(); } e.target.value = ""; }}><option value="">Update status…</option>{PIPELINE_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn-secondary btn-xs" onClick={async () => { if (await bulk("rescore", ids)) reload(); }}><RefreshCw className="h-3.5 w-3.5" />Rescore</button>
          <button className="btn-secondary btn-xs" onClick={async () => { if (await bulk(fixedFilters?.archived ? "unarchive" : "archive", ids)) { clear(); reload(); } }}><Archive className="h-3.5 w-3.5" />{fixedFilters?.archived ? "Unarchive" : "Archive"}</button>
          <button className="btn-secondary btn-xs text-red-600" onClick={() => setConfirm({ ids, done: () => { clear(); reload(); } })}><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </>)} />
      <Confirm open={!!confirm} title="Delete leads" message={`Delete ${confirm?.ids.length} lead(s)? They are soft-deleted and recorded in the audit trail; a manager can restore them.`} onClose={() => setConfirm(null)} onConfirm={async () => { if (confirm && await bulk("delete", confirm.ids)) confirm.done(); setConfirm(null); }} />
      <span className="hidden"><UserPlus /></span>
    </>
  );
}
