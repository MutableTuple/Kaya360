"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ShieldCheck, Search, Globe, Mail, Pencil, X, Trash2 } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/forms";
import { api, PageHeader, Badge, human, fmtDate, useToast, Spinner, DemoBadge, ExternalLink, Confirm } from "@/components/ui";
import { ROLE_GROUPS, EMAIL_STATUS_LABEL, PHONE_STATUS_LABEL } from "@/lib/constants";
import { useMe, canWrite } from "@/components/me";

type Row = Record<string, any>;

function Drawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [c, setC] = useState<Row | null>(null); const [busy, setBusy] = useState<string | null>(null); const [edit, setEdit] = useState(false); const [del, setDel] = useState(false);
  const [li, setLi] = useState<{ url: string; title: string; snippet: string; mentionsCompany: boolean }[] | null>(null); const [hist, setHist] = useState<Row[]>([]);
  const toast = useToast(); const { me } = useMe(); const w = canWrite(me); const router = useRouter();
  const load = () => { api<{ record: Row }>(`/api/r/contacts/${id}`).then((d) => setC(d.record)).catch((e) => toast("error", e.message)); api<{ rows: Row[] }>(`/api/r/email_verifications?f_contact=${id}&pageSize=10`).then((d) => setHist(d.rows)).catch(() => null); };
  useEffect(load, [id]);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(null); } };
  if (!c) return <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg items-center justify-center border-l bg-white"><Spinner /></div>;
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-2"><div className="flex-1"><h3 className="text-lg font-semibold text-navy-900">{c.full_name} <DemoBadge show={c.is_demo} /></h3><div className="text-sm text-slate-600">{c.designation ?? "Designation not recorded"}{c.company_name && <> · <Link className="text-navy-600 hover:underline" href={`/companies/${c.company_id}`}>{c.company_name}</Link></>}</div><div className="font-mono text-xs text-slate-400">{c.contact_code}</div></div><button className="btn-ghost btn-xs" onClick={onClose}><X className="h-4 w-4" /></button></div>
      {w && <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary btn-xs" disabled={!!busy} onClick={() => run("email", async () => { const r = await api<{ found: boolean; email?: string; suggestion?: string; message: string }>(`/api/contacts/${id}/find-email`, { method: "POST" }); toast(r.found ? "success" : "info", r.suggestion ? `${r.message}\nSuggestion: ${r.suggestion}` : r.message); load(); onChanged(); })}>{busy === "email" ? <Spinner /> : <Search className="h-3.5 w-3.5" />}Find business email</button>
        <button className="btn-secondary btn-xs" disabled={!!busy || !(c.direct_email || c.company_email)} onClick={() => run("verify", async () => { const r = await api<{ result: Row }>(`/api/contacts/${id}/verify`, { method: "POST", json: {} }); toast("success", `${r.result.email}: ${human(r.result.status)} via ${r.result.provider}`); load(); onChanged(); })}>{busy === "verify" ? <Spinner /> : <ShieldCheck className="h-3.5 w-3.5" />}Verify email</button>
        <button className="btn-secondary btn-xs" disabled={!!busy} onClick={() => run("li", async () => { const r = await api<{ candidates: typeof li; message: string }>(`/api/contacts/${id}/find-linkedin`, { method: "POST" }); setLi(r.candidates ?? []); if (!r.candidates?.length) toast("info", r.message); })}>{busy === "li" ? <Spinner /> : <Globe className="h-3.5 w-3.5" />}Find LinkedIn</button>
        <button className="btn-secondary btn-xs" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" />Edit contact</button>
        <button className="btn-primary btn-xs" disabled={!(c.direct_email || c.company_email)} onClick={() => router.push(`/email?contact=${id}`)}><Mail className="h-3.5 w-3.5" />Send introduction email</button>
        <button className="btn-ghost btn-xs text-red-600" onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>}
      {li && li.length > 0 && <div className="mt-3 rounded-lg border border-navy-200 bg-navy-50/50 p-3"><div className="mb-1 text-xs font-semibold text-navy-800">Public LinkedIn search results — confirm the right profile</div>{li.map((x) => <div key={x.url} className="mb-2 text-xs"><div className="flex items-center gap-2"><ExternalLink href={x.url}>{x.title}</ExternalLink>{x.mentionsCompany && <Badge tone="verified">mentions company</Badge>}</div><div className="text-slate-500">{x.snippet}</div><button className="btn-secondary btn-xs mt-1" onClick={async () => { await api(`/api/r/contacts/${id}`, { method: "PATCH", json: { linkedin_url: x.url } }); toast("success", "LinkedIn profile saved."); setLi(null); load(); }}>This is the person</button></div>)}</div>}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="rounded-lg border border-slate-200 p-3"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Company-level contact details</div><dl className="kv grid grid-cols-2 gap-x-3"><div><dt>Company email</dt><dd>{c.company_email ?? "—"}</dd></div><div><dt>Official phone</dt><dd>{c.company_phone ?? "—"}</dd></div></dl></div>
        <div className="rounded-lg border border-slate-200 p-3"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Direct professional details</div><dl className="kv grid grid-cols-2 gap-x-3">
          <div><dt>Direct email</dt><dd>{c.direct_email ?? "—"}</dd></div><div><dt>Verification</dt><dd><Badge tone={c.email_verification_status}>{EMAIL_STATUS_LABEL[c.email_verification_status]}</Badge>{c.email_verification_provider && <span className="ml-1 text-xs text-slate-500">via {c.email_verification_provider} · {fmtDate(c.email_verified_at)}</span>}</dd></div>
          <div className="col-span-2"><dt>Email source</dt><dd className="text-xs">{c.direct_email_source ?? "—"}</dd></div>
          <div><dt>Professional phone</dt><dd>{c.professional_phone ?? "—"}</dd></div><div><dt>Phone status</dt><dd><Badge tone={c.phone_status}>{PHONE_STATUS_LABEL[c.phone_status]}</Badge></dd></div>
          <div className="col-span-2"><dt>LinkedIn</dt><dd><ExternalLink href={c.linkedin_url} /></dd></div></dl></div>
        <dl className="kv grid grid-cols-2 gap-x-3"><div><dt>Role group</dt><dd>{ROLE_GROUPS[c.role_group]?.label ?? human(c.role_group)}</dd></div><div><dt>Department</dt><dd>{c.department ?? "—"}</dd></div><div><dt>Office</dt><dd>{c.office_location ?? "—"}</dd></div><div><dt>Project</dt><dd>{c.project_id ? <Link className="text-navy-600 hover:underline" href={`/projects/${c.project_id}`}>{c.project_name}</Link> : "—"}</dd></div><div className="col-span-2"><dt>Source</dt><dd><ExternalLink href={c.source_url} /> <span className="text-xs text-slate-500">{c.source_note}</span></dd></div><div><dt>Last verified</dt><dd>{fmtDate(c.last_verified_at, true)}</dd></div></dl>
        {hist.length > 0 && <div><div className="label">Verification history</div>{hist.map((h) => <div key={h.id} className="flex justify-between text-xs"><span>{h.email} · {h.provider} · {h.raw_result}</span><Badge tone={h.status}>{human(h.status)}</Badge><span className="text-slate-400">{fmtDate(h.checked_at, true)}</span></div>)}</div>}
      </div>
      <EntityFormModal open={edit} onClose={() => setEdit(false)} resource="contacts" title="Edit contact" initial={c} onSaved={() => { load(); onChanged(); }} />
      <Confirm open={del} title="Delete contact" message="Soft-delete this contact?" onClose={() => setDel(false)} onConfirm={async () => { try { await api(`/api/r/contacts/${id}?confirm=1`, { method: "DELETE" }); onChanged(); onClose(); } catch (e) { toast("error", (e as Error).message); } }} />
    </div>
  );
}

function Inner() {
  const sp = useSearchParams(); const [open, setOpen] = useState<string | null>(sp.get("open")); const [add, setAdd] = useState(false); const [rk, setRk] = useState(0);
  const toast = useToast(); const { me } = useMe();
  return (
    <div>
      <PageHeader title="Decision Makers" subtitle="Professional contacts from public sources and approved enrichment. Company-level details are kept separate from direct personal professional details." actions={canWrite(me) && <button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />Add contact</button>} />
      <DataTable<Row> resource="contacts" exportType="contacts" reloadKey={rk} onRowClick={(r) => setOpen(String(r.id))} selectable={canWrite(me)}
        columns={[
          { key: "full_name", header: "Name", sortable: true, render: (r) => <div className="font-medium text-slate-800">{r.full_name} <DemoBadge show={r.is_demo} /></div> },
          { key: "designation", header: "Designation", sortable: true }, { key: "company_name", header: "Company", sortable: true },
          { key: "role_group", header: "Role group", render: (r) => ROLE_GROUPS[r.role_group]?.label ?? human(r.role_group) },
          { key: "direct_email", header: "Direct email", render: (r) => <span className="text-xs">{r.direct_email ?? "—"}</span> }, { key: "company_email", header: "Company email", render: (r) => <span className="text-xs">{r.company_email ?? "—"}</span> },
          { key: "email_verification_status", header: "Verification", sortable: true, render: (r) => <Badge tone={r.email_verification_status}>{EMAIL_STATUS_LABEL[r.email_verification_status]}</Badge> },
          { key: "phone", header: "Phone", render: (r) => <span className="text-xs">{r.professional_phone ?? r.company_phone ?? "—"}<div className="text-slate-400">{PHONE_STATUS_LABEL[r.phone_status]}</div></span> },
          { key: "linkedin_url", header: "LinkedIn", render: (r) => r.linkedin_url ? <span onClick={(e) => e.stopPropagation()}><ExternalLink href={r.linkedin_url}>Profile</ExternalLink></span> : "—" },
          { key: "last_verified_at", header: "Last verified", sortable: true, render: (r) => fmtDate(r.last_verified_at) },
        ]}
        filters={[{ key: "role_group", label: "Role group", type: "select", options: Object.entries(ROLE_GROUPS).map(([k, v]) => [k, v.label] as const) }, { key: "email_status", label: "Email verification", type: "select", options: Object.entries(EMAIL_STATUS_LABEL) }, { key: "phone_status", label: "Phone status", type: "select", options: Object.entries(PHONE_STATUS_LABEL) }, { key: "demo", label: "DEMO only", type: "bool" }]}
        bulkActions={(ids, clear, reload) => <button className="btn-secondary btn-xs" onClick={async () => { toast("info", `Verifying ${ids.length} contact(s)…`); try { const r = await api<{ verified: number; processed: number; results: { ok: boolean; error?: string }[] }>("/api/contacts/verify-bulk", { method: "POST", json: { ids: ids.slice(0, 50) } }); const errs = r.results.filter((x) => !x.ok); toast(errs.length ? "error" : "success", `${r.processed} checked, ${r.verified} verified.${errs.length ? `\n${errs.length} failed: ${errs[0].error}` : ""}`); clear(); reload(); } catch (e) { toast("error", (e as Error).message); } }}><ShieldCheck className="h-3.5 w-3.5" />Bulk verify (max 50)</button>} />
      {open && <Drawer id={open} onClose={() => setOpen(null)} onChanged={() => setRk((x) => x + 1)} />}
      <EntityFormModal open={add} onClose={() => setAdd(false)} resource="contacts" title="Add contact" onSaved={(r) => { setRk((x) => x + 1); setOpen(String(r.id)); }} />
    </div>
  );
}
export default function ContactsPage() { return <Suspense><Inner /></Suspense>; }
