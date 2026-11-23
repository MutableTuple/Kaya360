"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Archive, Bell, Mail, Download, RefreshCw, ShieldCheck, MessageSquare } from "lucide-react";
import { api, useFetch, Badge, ScorePill, ErrorBox, Spinner, PageHeader, Tabs, fmtDate, inr, human, useToast, Confirm, Modal, DemoBadge, ExternalLink } from "@/components/ui";
import { EntityFormModal, RefSelect } from "@/components/forms";
import { PIPELINE_STAGES, STAGE_LABEL, OPPORTUNITY_CLASSES, label } from "@/lib/constants";
import { useMe, canWrite, isManager } from "@/components/me";
import { AuditList } from "@/components/AuditList";

type Any = Record<string, any>;

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useFetch<{ lead: Any; project: Any | null; activities: Any[]; followUps: Any[]; emails: Any[]; contacts: Any[]; audit: Any[] }>(`/api/leads/${id}/detail`);
  const [tab, setTab] = useState("overview"); const [edit, setEdit] = useState(false); const [fu, setFu] = useState(false); const [del, setDel] = useState(false); const [adj, setAdj] = useState(false);
  const [note, setNote] = useState(""); const [noteKind, setNoteKind] = useState("note");
  const toast = useToast(); const router = useRouter(); const { me } = useMe();
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;
  const { lead: l, project: p } = data;
  const w = canWrite(me);
  const patch = async (body: Any, msg = "Saved.") => { try { await api(`/api/r/leads/${id}`, { method: "PATCH", json: body }); toast("success", msg); reload(); } catch (e) { toast("error", (e as Error).message); } };
  const move = async (stage: string) => { try { await api(`/api/leads/${id}/move`, { method: "POST", json: { stage } }); toast("success", `Moved to ${STAGE_LABEL[stage]}.`); reload(); } catch (e) { toast("error", (e as Error).message); } };
  return (
    <div>
      <PageHeader title={l.project_name ?? l.title ?? l.lead_code} subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{l.lead_code}</span>{l.company_name && <Link className="text-navy-600 hover:underline" href={`/companies/${l.company_id}`}>{l.company_name}</Link>}{l.city && <span>{l.city}, {l.state}</span>}<DemoBadge show={l.is_demo} />{l.archived_at && <Badge>Archived</Badge>}</span>}
        actions={w && <>
          <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button>
          <button className="btn-secondary" onClick={() => setFu(true)}><Bell className="h-4 w-4" />Set reminder</button>
          <Link className="btn-secondary" href={`/email?lead=${id}${l.primary_contact_id ? `&contact=${l.primary_contact_id}` : ""}`}><Mail className="h-4 w-4" />Send introduction email</Link>
          {p && <a className="btn-secondary" href={`/api/export/project/${p.id}`}><Download className="h-4 w-4" />Export</a>}
          <button className="btn-secondary" onClick={() => api("/api/r/leads/bulk", { method: "POST", json: { action: l.archived_at ? "unarchive" : "archive", ids: [id] } }).then(() => { toast("success", l.archived_at ? "Unarchived." : "Archived."); reload(); })}><Archive className="h-4 w-4" />{l.archived_at ? "Unarchive" : "Archive"}</button>
          <button className="btn-secondary text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "activity", label: `Activity (${data.activities.length})` }, { id: "followups", label: `Follow-ups (${data.followUps.length})` }, { id: "emails", label: `Emails (${data.emails.length})` }, ...(isManager(me) ? [{ id: "audit", label: "Audit trail" }] : [])]} />
          {tab === "overview" && <div className="space-y-4">
            <div className="card">
              <div className="card-h"><span className="card-t">Lead score explanation</span><div className="flex gap-2">{w && <><button className="btn-ghost btn-xs" onClick={async () => { await api(`/api/leads/${id}/score`, { method: "POST" }); reload(); toast("success", "Score recalculated from current records."); }}><RefreshCw className="h-3.5 w-3.5" />Recalculate</button><button className="btn-secondary btn-xs" onClick={() => setAdj(true)}>Manual adjustment</button></>}</div></div>
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3"><ScorePill score={l.score} priority={l.priority} /><span className="text-sm text-slate-600">Automatic {l.score_auto}{l.score_adjustment ? ` ${l.score_adjustment > 0 ? "+" : ""}${l.score_adjustment} manual (${l.score_adjustment_reason})` : ""} · {human(l.priority)} lead · scored {fmtDate(l.scored_at, true)}</span></div>
                <ul className="space-y-2">{(l.score_breakdown ?? []).map((i: Any) => (
                  <li key={i.key}><div className="flex justify-between text-sm"><span className="font-medium text-slate-700">{i.label}</span><span className="tabular-nums text-slate-600">{i.points} / {i.max}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-600" style={{ width: `${i.max ? (i.points / i.max) * 100 : 0}%` }} /></div><div className="mt-0.5 text-xs text-slate-500">{i.reason}</div></li>))}</ul>
              </div>
            </div>
            {p && <div className="card"><div className="card-h"><span className="card-t">Project</span><Link className="text-xs text-navy-600 hover:underline" href={`/projects/${p.id}`}>Open full profile</Link></div>
              <dl className="kv grid grid-cols-2 gap-x-4 p-4 sm:grid-cols-3">
                <div><dt>Classification</dt><dd><Badge tone={p.opportunity_class}>{label(OPPORTUNITY_CLASSES, p.opportunity_class)}</Badge></dd></div><div><dt>Category</dt><dd>{p.category ?? "—"}</dd></div><div><dt>Stage</dt><dd>{human(p.current_stage)}</dd></div>
                <div><dt>Area</dt><dd>{p.area_sqft ? `${Number(p.area_sqft).toLocaleString("en-IN")} sq ft` : "—"}</dd></div><div><dt>Project value</dt><dd>{inr(p.estimated_project_value)}</dd></div><div><dt>Contractor status</dt><dd>{human(p.contractor_appointment_status)}</dd></div>
                <div className="col-span-full"><dt>Evidence</dt><dd className="italic">{p.opportunity_evidence ?? "—"}</dd></div><div className="col-span-full"><dt>Source</dt><dd><ExternalLink href={p.primary_source_url}>{p.primary_source_title ?? p.primary_source_url}</ExternalLink></dd></div>
              </dl></div>}
            <div className="card"><div className="card-h"><span className="card-t">Decision makers</span>{l.company_id && <Link className="text-xs text-navy-600 hover:underline" href={`/companies/${l.company_id}`}>Find more on company page</Link>}</div>
              <ul className="divide-y divide-slate-100">{data.contacts.length === 0 && <li className="p-4 text-sm text-slate-500">No contacts linked. Use <b>Find decision makers</b> on the company page.</li>}
                {data.contacts.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"><div className="min-w-0 flex-1"><div className="font-medium">{c.full_name} {c.id === l.primary_contact_id && <Badge tone="verified">Primary</Badge>}</div><div className="text-xs text-slate-500">{[c.designation, c.direct_email ?? c.company_email].filter(Boolean).join(" · ")}</div></div><Badge tone={c.email_verification_status}>{human(c.email_verification_status)}</Badge>
                  {w && c.id !== l.primary_contact_id && <button className="btn-ghost btn-xs" onClick={() => patch({ primary_contact_id: c.id }, "Primary contact set.")}>Make primary</button>}
                  {w && (c.direct_email || c.company_email) && <button className="btn-secondary btn-xs" onClick={async () => { try { const r = await api<{ result: Any }>(`/api/contacts/${c.id}/verify`, { method: "POST", json: {} }); toast("success", `${r.result.email}: ${human(r.result.status)} (${r.result.provider})`); reload(); } catch (e) { toast("error", (e as Error).message); } }}><ShieldCheck className="h-3.5 w-3.5" />Verify</button>}</li>)}</ul></div>
            {l.notes && <div className="card p-4 text-sm"><div className="label">Notes</div><p className="whitespace-pre-wrap">{l.notes}</p></div>}
          </div>}
          {tab === "activity" && <div className="card">
            {w && <form className="flex gap-2 border-b p-3" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; try { await api(`/api/leads/${id}/notes`, { method: "POST", json: { summary: note, kind: noteKind } }); setNote(""); reload(); } catch (er) { toast("error", (er as Error).message); } }}>
              <select className="input w-32" value={noteKind} onChange={(e) => setNoteKind(e.target.value)}><option value="note">Note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="site_visit">Site visit</option></select>
              <input className="input" placeholder="Add a note or log an interaction…" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn-primary"><MessageSquare className="h-4 w-4" />Add</button></form>}
            <ul className="divide-y divide-slate-100">{data.activities.map((a) => <li key={a.id} className="px-4 py-2.5 text-sm"><div className="flex justify-between gap-2"><span><Badge>{human(a.kind)}</Badge> <span className="ml-1">{a.summary}</span></span><span className="whitespace-nowrap text-xs text-slate-400">{fmtDate(a.created_at, true)}</span></div><div className="text-xs text-slate-400">{a.author?.full_name ?? a.author?.email ?? "System"}</div></li>)}
              {data.activities.length === 0 && <li className="p-4 text-center text-sm text-slate-400">No activity yet</li>}</ul></div>}
          {tab === "followups" && <div className="card"><div className="card-h"><span className="card-t">Follow-ups</span>{w && <button className="btn-primary btn-xs" onClick={() => setFu(true)}>Set follow-up</button>}</div>
            <ul className="divide-y divide-slate-100">{data.followUps.map((f) => <li key={f.id} className="flex items-center gap-2 px-4 py-2 text-sm"><Badge tone={f.status === "done" ? "done" : new Date(f.due_at) < new Date() ? "failed" : "pending"}>{f.status === "pending" && new Date(f.due_at) < new Date() ? "Overdue" : human(f.status)}</Badge><span className="flex-1">{f.title} <span className="text-xs text-slate-500">· {human(f.activity_type)} · {f.assigned_name}</span></span><span className="text-xs">{fmtDate(f.due_at, true)}</span>{w && f.status === "pending" && <button className="btn-secondary btn-xs" onClick={async () => { await api(`/api/r/follow_ups/${f.id}`, { method: "PATCH", json: { status: "done" } }); reload(); }}>Mark done</button>}</li>)}
              {data.followUps.length === 0 && <li className="p-4 text-center text-sm text-slate-400">No follow-ups scheduled</li>}</ul></div>}
          {tab === "emails" && <div className="card"><ul className="divide-y divide-slate-100">{data.emails.map((e) => <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm"><Badge tone={e.status}>{human(e.status)}</Badge><span className="flex-1">{e.subject} <span className="text-xs text-slate-500">→ {e.to_email}</span></span><span className="text-xs text-slate-500">{fmtDate(e.sent_at ?? e.created_at, true)}{e.replied_at && " · replied"}</span></li>)}{data.emails.length === 0 && <li className="p-4 text-center text-sm text-slate-400">No emails yet</li>}</ul></div>}
          {tab === "audit" && <AuditList rows={data.audit} />}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="label">Pipeline stage</div>
            <select className="input" value={l.stage} disabled={!w} onChange={(e) => move(e.target.value)}>{PIPELINE_STAGES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            <div className="label mt-3">Assigned employee</div>
            {w ? <RefSelect refName="team" value={l.assigned_to} initialLabel={l.assigned_name} onChange={(v) => patch({ assigned_to: v }, "Assignment updated.")} /> : <div className="text-sm">{l.assigned_name ?? "Unassigned"}</div>}
            <dl className="kv mt-4 grid grid-cols-2 gap-x-3">
              <div><dt>Est. value</dt><dd>{inr(l.estimated_value)}</dd></div><div><dt>Lead source</dt><dd>{human(l.lead_source)}</dd></div>
              <div><dt>Last contact</dt><dd>{fmtDate(l.last_contact_date)}</dd></div><div><dt>Next follow-up</dt><dd>{fmtDate(l.next_follow_up, true)}</dd></div>
              <div><dt>Discovered</dt><dd>{fmtDate(l.discovered_at)}</dd></div><div><dt>Primary contact</dt><dd>{l.contact_name ?? "—"}</dd></div>
              {l.stage === "lost" && <div className="col-span-2"><dt>Lost reason</dt><dd>{l.lost_reason ?? "—"}</dd></div>}
            </dl>
          </div>
        </div>
      </div>

      <EntityFormModal open={edit} onClose={() => setEdit(false)} resource="leads" title="Edit lead" initial={l} onSaved={() => reload()} />
      <EntityFormModal open={fu} onClose={() => setFu(false)} resource="follow_ups" title="Set follow-up" defaults={{ lead_id: id, company_id: l.company_id, contact_id: l.primary_contact_id, assigned_to: l.assigned_to ?? me?.id, title: `Follow up: ${l.project_name ?? l.title ?? ""}`.slice(0, 280), due_at: new Date(Date.now() + 2 * 86400000).toISOString() }} onSaved={() => reload()} />
      <AdjustModal open={adj} onClose={() => setAdj(false)} current={l.score_adjustment} onSave={(v, r) => { patch({ score_adjustment: v, score_adjustment_reason: r }, "Score adjustment saved."); setAdj(false); }} />
      <Confirm open={del} title="Delete lead" message="This lead will be soft-deleted and logged in the audit trail. Continue?" onClose={() => setDel(false)} onConfirm={async () => { try { await api(`/api/r/leads/${id}?confirm=1`, { method: "DELETE" }); toast("success", "Lead deleted."); router.push("/leads"); } catch (e) { toast("error", (e as Error).message); } }} />
    </div>
  );
}

function AdjustModal({ open, onClose, current, onSave }: { open: boolean; onClose: () => void; current: number; onSave: (v: number, r: string) => void }) {
  const [v, setV] = useState(current ?? 0); const [r, setR] = useState("");
  return <Modal open={open} onClose={onClose} title="Manual score adjustment" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={v !== 0 && r.trim().length < 5} onClick={() => onSave(v, r)}>Save</button></>}>
    <p className="mb-3 text-sm text-slate-600">Adjust the automatic score up or down. A reason is required and recorded in the activity history.</p>
    <label className="label">Adjustment (−100 to +100)</label><input className="input" type="number" min={-100} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} />
    <label className="label mt-3">Reason</label><textarea className="input" rows={3} value={r} onChange={(e) => setR(e.target.value)} placeholder="e.g. Met the facilities head on site; scope confirmed verbally." />
  </Modal>;
}

