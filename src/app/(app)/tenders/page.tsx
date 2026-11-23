"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Sparkles, X, Pencil, ArrowRight, AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/forms";
import { api, PageHeader, Badge, inr, fmtDate, human, useToast, DemoBadge, ExternalLink, useFetch } from "@/components/ui";
import { TENDER_CATEGORIES } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, canWrite } from "@/components/me";

type Row = Record<string, any>;
const daysLeft = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

function Drawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [t, setT] = useState<Row | null>(null); const [edit, setEdit] = useState(false); const toast = useToast(); const router = useRouter(); const { me } = useMe();
  const load = () => api<{ record: Row }>(`/api/r/tenders/${id}`).then((d) => setT(d.record)).catch((e) => toast("error", e.message));
  useEffect(() => { load(); }, [id]);
  if (!t) return null;
  const dl = daysLeft(t.submission_deadline);
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-2"><div className="flex-1"><h3 className="text-base font-semibold text-navy-900">{t.title} <DemoBadge show={t.is_demo} /></h3><div className="text-sm text-slate-600">{t.organisation}</div><div className="font-mono text-xs text-slate-400">{t.tender_code}</div></div><button className="btn-ghost btn-xs" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="mt-2 flex flex-wrap gap-2"><Badge tone={t.deadline_status}>{human(t.deadline_status)}</Badge><Badge tone={t.verification_status}>{human(t.verification_status)}</Badge>{dl != null && dl >= 0 && dl <= 7 && <Badge tone="hot"><AlertTriangle className="h-3 w-3" />Closes in {dl} day(s)</Badge>}</div>
      {canWrite(me) && <div className="mt-3 flex gap-2"><button className="btn-secondary btn-xs" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" />Edit</button>{t.lead_id ? <Link className="btn-primary btn-xs" href={`/leads/${t.lead_id}`}>Open lead</Link> : <button className="btn-primary btn-xs" onClick={async () => { try { const r = await api<{ record: Row }>(`/api/tenders/${id}/lead`, { method: "POST" }); router.push(`/leads/${r.record.id}`); } catch (e) { toast("error", (e as Error).message); } }}><ArrowRight className="h-3.5 w-3.5" />Convert to lead</button>}</div>}
      <dl className="kv mt-4 grid grid-cols-2 gap-x-4">
        {([["Reference no.", t.reference_number ?? "Not published in source"], ["Category", t.category], ["Location", [t.location, t.city, t.state].filter(Boolean).join(", ")], ["Estimated value", inr(t.estimated_value, false)], ["EMD", inr(t.emd_amount, false)], ["Published", fmtDate(t.publication_date)], ["Submission deadline", t.submission_deadline ? fmtDate(t.submission_deadline, true) : "Not published in source"], ["Status (as recorded)", human(t.status)], ["Last verified", fmtDate(t.last_verified_at, true)]] as [string, string][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
        <div className="col-span-2"><dt>Work description</dt><dd className="whitespace-pre-wrap">{t.work_description ?? "—"}</dd></div>
        <div className="col-span-2"><dt>Eligibility</dt><dd className="whitespace-pre-wrap">{t.eligibility ?? "—"}</dd></div>
        <div className="col-span-2"><dt>Required experience</dt><dd className="whitespace-pre-wrap">{t.required_experience ?? "—"}</dd></div>
        <div className="col-span-2"><dt>Tender document</dt><dd><ExternalLink href={t.document_url} /></dd></div><div className="col-span-2"><dt>Official submission</dt><dd><ExternalLink href={t.submission_url} /></dd></div><div className="col-span-2"><dt>Source</dt><dd><ExternalLink href={t.source_url}>{t.source_title ?? undefined}</ExternalLink></dd></div>
      </dl>
      <p className="mt-3 text-[11px] text-slate-500">Always confirm reference numbers, deadlines and eligibility on the official portal before bidding.</p>
      <EntityFormModal open={edit} onClose={() => setEdit(false)} resource="tenders" title="Edit tender" initial={t} onSaved={() => { load(); onChanged(); }} />
    </div>
  );
}

function Inner() {
  const sp = useSearchParams(); const router = useRouter(); const { me } = useMe();
  const [open, setOpen] = useState<string | null>(sp.get("open")); const [add, setAdd] = useState(false); const [rk, setRk] = useState(0);
  const { data: soon } = useFetch<{ rows: Row[]; total: number }>("/api/r/tenders?f_status=closing_soon&pageSize=5", [rk]);
  const startDiscovery = async () => { router.push("/discovery"); };
  return (
    <div>
      <PageHeader title="Tenders & RFQs" subtitle="Interior, fit-out, finishing, furniture and empanelment opportunities. Reference numbers and deadlines are stored only as published by the source." actions={<>{canWrite(me) && <button className="btn-secondary" onClick={startDiscovery}><Sparkles className="h-4 w-4" />Discover tenders</button>}{canWrite(me) && <button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Add tender</button>}</>} />
      {!!soon?.total && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b><AlertTriangle className="mr-1 inline h-4 w-4" />{soon.total} tender(s) closing within 7 days:</b> {soon.rows.map((t) => <button key={t.id} className="ml-2 underline" onClick={() => setOpen(t.id)}>{t.title.slice(0, 50)} ({fmtDate(t.submission_deadline)})</button>)}</div>}
      <DataTable<Row> resource="tenders" exportType="tenders" defaultSort="submission_deadline" defaultDir="asc" reloadKey={rk} onRowClick={(r) => setOpen(String(r.id))}
        columns={[
          { key: "title", header: "Tender", render: (r) => <div className="max-w-[300px]"><div className="font-medium text-slate-800">{r.title} <DemoBadge show={r.is_demo} /></div><div className="text-xs text-slate-500">{r.reference_number ?? "Ref. not published"}</div></div> },
          { key: "organisation", header: "Organisation", sortable: true }, { key: "state", header: "State", sortable: true }, { key: "category", header: "Category" },
          { key: "estimated_value", header: "Est. value", sortable: true, render: (r) => inr(r.estimated_value) }, { key: "emd_amount", header: "EMD", render: (r) => inr(r.emd_amount) },
          { key: "publication_date", header: "Published", sortable: true, render: (r) => fmtDate(r.publication_date) },
          { key: "submission_deadline", header: "Deadline", sortable: true, render: (r) => { const d = daysLeft(r.submission_deadline); return <span className={d != null && d >= 0 && d <= 7 ? "font-semibold text-red-700" : ""}>{fmtDate(r.submission_deadline, true)}{d != null && d >= 0 && <div className="text-[10px]">{d} day(s) left</div>}</span>; } },
          { key: "deadline_status", header: "Status", render: (r) => <Badge tone={r.deadline_status}>{human(r.deadline_status)}</Badge> },
        ]}
        filters={[{ key: "status", label: "Status", type: "select", options: [["active", "Active"], ["upcoming", "Upcoming"], ["closing_soon", "Closing soon"], ["closed", "Closed"], ["unknown", "Unknown"]] }, { key: "organisation", label: "Organisation", type: "text" }, { key: "state", label: "State", type: "select", options: STATES.map((s) => [s.name, s.name] as const) }, { key: "category", label: "Category", type: "select", options: TENDER_CATEGORIES.map((c) => [c, c] as const) }, { key: "value_min", label: "Min value (₹)", type: "number" }, { key: "value_max", label: "Max value (₹)", type: "number" }]} />
      {open && <Drawer id={open} onClose={() => setOpen(null)} onChanged={() => setRk((x) => x + 1)} />}
      <EntityFormModal open={add} onClose={() => setAdd(false)} resource="tenders" title="Add tender" onSaved={(r) => { setRk((x) => x + 1); setOpen(String(r.id)); }} />
    </div>
  );
}
export default function TendersPage() { return <Suspense><Inner /></Suspense>; }
