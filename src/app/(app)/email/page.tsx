"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Save, Plus, Pencil, Trash2, RefreshCw, Link2, Unlink, AlertTriangle } from "lucide-react";
import { api, useFetch, PageHeader, Tabs, Badge, Spinner, useToast, Confirm, fmtDate, human, Modal } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { RefSelect, EntityFormModal } from "@/components/forms";
import { unfilled } from "@/lib/templates";
import { useMe, canWrite, isManager } from "@/components/me";

type R = Record<string, any>;

function Compose({ draftId, initialLead, initialContact, onSaved }: { draftId?: string | null; initialLead?: string | null; initialContact?: string | null; onSaved: () => void }) {
  const toast = useToast();
  const { data: tpl } = useFetch<{ rows: R[] }>("/api/r/email_templates?pageSize=100&sort=name&dir=asc");
  const [contact, setContact] = useState<string | null>(initialContact ?? null); const [lead, setLead] = useState<string | null>(initialLead ?? null); const [template, setTemplate] = useState("");
  const [to, setTo] = useState(""); const [cc, setCc] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [meta, setMeta] = useState<{ company_id?: string | null; status?: string }>({}); const [id, setId] = useState<string | null>(draftId ?? null);
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (draftId) api<{ record: R }>(`/api/r/email_logs/${draftId}`).then(({ record: d }) => { setTo(d.to_email); setCc(d.cc ?? ""); setSubject(d.subject); setBody(d.body); setContact(d.contact_id); setLead(d.lead_id); setMeta({ company_id: d.company_id }); setId(d.id); }).catch((e) => toast("error", e.message)); }, [draftId]);
  const render = async (t = template, c = contact, l = lead) => {
    if (!t && !c && !l) return;
    try { const r = await api<{ to: string | null; subject: string; body: string; missing: string[]; contact: R | null; lead_id: string | null }>("/api/email/compose", { method: "POST", json: { template_id: t || null, contact_id: c, lead_id: l } });
      if (r.to) setTo(r.to); if (t) { setSubject(r.subject); setBody(r.body); } setMeta({ company_id: r.contact?.company_id, status: r.contact?.status });
      if (r.missing.length) toast("info", `Complete these placeholders before sending: ${r.missing.join(", ")}`);
    } catch (e) { toast("error", (e as Error).message); }
  };
  useEffect(() => { if (!draftId && (initialContact || initialLead)) render("", initialContact ?? null, initialLead ?? null); }, []);
  const save = async () => { setBusy(true); try { const r = await api<{ record: R }>("/api/email/drafts", { method: "POST", json: { id: id ?? undefined, to_email: to, cc: cc || null, subject, body, contact_id: contact, lead_id: lead, company_id: meta.company_id ?? null, template_id: template || null } }); setId(r.record.id); toast("success", "Draft saved."); onSaved(); return r.record.id as string; } catch (e) { toast("error", (e as Error).message); return null; } finally { setBusy(false); } };
  const send = async () => { const did = await save(); if (!did) return; setBusy(true); try { const r = await api<{ message: string }>(`/api/email/${did}/send`, { method: "POST" }); toast("success", r.message); setConfirm(false); setId(null); setSubject(""); setBody(""); onSaved(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); } };
  const missing = [...unfilled(subject), ...unfilled(body)];
  return (
    <div className="card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div><label className="label">Lead contact</label><RefSelect refName="contacts" value={contact} onChange={(v) => { setContact(v); if (v) render(template, v, lead); }} /></div>
        <div><label className="label">Lead (optional)</label><RefSelect refName="leads" value={lead} onChange={(v) => { setLead(v); render(template, contact, v); }} /></div>
        <div><label className="label">Template</label><select className="input" value={template} onChange={(e) => { setTemplate(e.target.value); render(e.target.value); }}><option value="">— Blank —</option>{(tpl?.rows ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className="label">To</label><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} />{meta.status && meta.status !== "verified" && <p className="mt-0.5 text-[11px] text-amber-700"><AlertTriangle className="mr-0.5 inline h-3 w-3" />This address is {human(meta.status).toLowerCase()} — consider verifying before sending.</p>}</div>
        <div><label className="label">CC</label><input className="input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma separated" /></div>
        <div className="md:col-span-3"><label className="label">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="md:col-span-3"><label className="label">Message</label><textarea className="input font-[inherit]" rows={14} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      </div>
      {missing.length > 0 && <p className="mt-2 text-xs text-amber-700">Unfilled placeholders: {missing.map((m) => `{{${m}}}`).join(", ")} — replace them before sending.</p>}
      <div className="mt-3 flex justify-end gap-2"><button className="btn-secondary" disabled={busy || !to || !subject || !body} onClick={save}><Save className="h-4 w-4" />Save draft</button><button className="btn-primary" disabled={busy || !to || !subject || !body || missing.length > 0} onClick={() => setConfirm(true)}><Send className="h-4 w-4" />Review & send</button></div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Approve and send this email?" wide footer={<><button className="btn-secondary" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={send}>{busy && <Spinner />}Approve & send</button></>}>
        <div className="text-sm"><div><b>To:</b> {to}{cc && <> · <b>CC:</b> {cc}</>}</div><div className="mt-1"><b>Subject:</b> {subject}</div><pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm">{body}</pre><p className="mt-2 text-xs text-slate-500">This will be sent from your connected Gmail account and logged against the lead. Nothing is sent without this approval.</p></div>
      </Modal>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams(); const toast = useToast(); const { me } = useMe();
  const [tab, setTab] = useState(sp.get("draft") || sp.get("lead") || sp.get("contact") ? "compose" : "compose");
  const [rk, setRk] = useState(0); const [draft, setDraft] = useState<string | null>(sp.get("draft")); const [tplEdit, setTplEdit] = useState<R | null | "new">(null); const [delTpl, setDelTpl] = useState<R | null>(null);
  const { data: acct, reload: reloadAcct } = useFetch<{ account: R | null; oauthConfigured: boolean }>("/api/email/account");
  useEffect(() => { const g = sp.get("gmail"); if (g === "connected") toast("success", "Gmail connected."); if (g === "denied") toast("error", "Gmail access was not granted."); }, []);
  return (
    <div>
      <PageHeader title="Email Centre" subtitle="Draft from templates and save emails to the database. Sending is turned off."
        actions={acct?.account ? <><Badge tone="verified">Connected: {acct.account.email}</Badge><button className="btn-secondary btn-xs" onClick={async () => { try { const r = await api<{ checked: number; replies: number }>("/api/email/check-replies", { method: "POST" }); toast("success", `Checked ${r.checked} thread(s): ${r.replies} new repl${r.replies === 1 ? "y" : "ies"}.`); setRk((x) => x + 1); } catch (e) { toast("error", (e as Error).message); } }}><RefreshCw className="h-3.5 w-3.5" />Check replies</button><button className="btn-ghost btn-xs" onClick={async () => { await api("/api/email/account?confirm=1", { method: "DELETE" }); reloadAcct(); }}><Unlink className="h-3.5 w-3.5" />Disconnect</button></>
          : acct?.oauthConfigured ? <a className="btn-primary" href="/api/email/oauth/start"><Link2 className="h-4 w-4" />Connect Gmail</a> : <Badge tone="needs_configuration">Email sending is off — drafts are saved only</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "compose", label: "Compose" }, { id: "drafts", label: "Drafts" }, { id: "history", label: "Communication history" }, { id: "templates", label: "Templates" }]} />
      {tab === "compose" && <Compose key={draft ?? "new"} draftId={draft} initialLead={sp.get("lead")} initialContact={sp.get("contact")} onSaved={() => setRk((x) => x + 1)} />}
      {(tab === "drafts" || tab === "history") && <DataTable<R> key={tab} resource="email_logs" reloadKey={rk} fixedFilters={tab === "drafts" ? { status: "draft|failed|approved" } : { status: "sent|sending|failed|received" }} onRowClick={(r) => { if (tab === "drafts") { setDraft(String(r.id)); setTab("compose"); } }}
        columns={[{ key: "status", header: "Status", render: (r) => <Badge tone={r.status}>{human(r.status)}</Badge> }, { key: "subject", header: "Subject", render: (r) => <div className="max-w-sm"><div className="font-medium">{r.subject}</div>{r.error && <div className="text-xs text-red-600">{r.error}</div>}</div> }, { key: "to_email", header: "To" }, { key: "contact_name", header: "Contact" }, { key: "company_name", header: "Company" }, { key: "lead_title", header: "Lead" }, { key: "created_by_name", header: "By" }, { key: "sent_at", header: tab === "drafts" ? "Updated" : "Sent", sortable: true, render: (r) => fmtDate(r.sent_at ?? r.updated_at, true) }, { key: "replied_at", header: "Reply", render: (r) => r.replied_at ? <Badge tone="verified">Replied {fmtDate(r.replied_at)}</Badge> : tab === "history" && r.status === "sent" && canWrite(me) ? <button className="btn-ghost btn-xs" onClick={async (e) => { e.stopPropagation(); await api(`/api/email/${r.id}/replied`, { method: "POST" }); setRk((x) => x + 1); }}>Log reply</button> : "—" }]} />}
      {tab === "templates" && <div>
        {canWrite(me) && <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setTplEdit("new")}><Plus className="h-4 w-4" />New template</button></div>}
        <DataTable<R> resource="email_templates" reloadKey={rk} defaultSort="name" defaultDir="asc" columns={[{ key: "name", header: "Template", sortable: true, render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.subject}</div></div> }, { key: "category", header: "Category", sortable: true }, { key: "is_system", header: "Type", render: (r) => r.is_system ? <Badge>System</Badge> : <Badge tone="potential">Custom</Badge> }, { key: "actions", header: "", render: (r) => <div className="flex gap-1">{(isManager(me) || (!r.is_system && r.created_by === me?.id)) && <button className="btn-ghost btn-xs" onClick={() => setTplEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>}{isManager(me) && !r.is_system && <button className="btn-ghost btn-xs text-red-600" onClick={() => setDelTpl(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</div> }]} />
      </div>}
      {tplEdit && <EntityFormModal open title={tplEdit === "new" ? "New template" : "Edit template"} resource="email_templates" initial={tplEdit === "new" ? null : tplEdit} onClose={() => setTplEdit(null)} onSaved={() => setRk((x) => x + 1)} />}
      <Confirm open={!!delTpl} title="Delete template" message={`Delete “${delTpl?.name}”?`} onClose={() => setDelTpl(null)} onConfirm={async () => { try { await api(`/api/r/email_templates/${delTpl!.id}?confirm=1`, { method: "DELETE" }); setRk((x) => x + 1); } catch (e) { toast("error", (e as Error).message); } setDelTpl(null); }} />
    </div>
  );
}
export default function EmailPage() { return <Suspense><Inner /></Suspense>; }
