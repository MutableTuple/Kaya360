"use client";
import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2, Users, Plus } from "lucide-react";
import { api, useFetch, Badge, ErrorBox, Spinner, PageHeader, fmtDate, human, useToast, Confirm, ScorePill, DemoBadge, ExternalLink, Modal } from "@/components/ui";
import { EntityFormModal } from "@/components/forms";
import { OPPORTUNITY_CLASSES, ROLE_GROUPS, STAGE_LABEL, label } from "@/lib/constants";
import { useMe, canWrite, isManager } from "@/components/me";

type Any = Record<string, any>;

function Inner({ id }: { id: string }) {
  const sp = useSearchParams();
  const { data, error, loading, reload } = useFetch<{ company: Any; projects: Any[]; contacts: Any[]; leads: Any[]; stakeholderOf: Any[]; sources: Any[] }>(`/api/companies/${id}/detail`);
  const [edit, setEdit] = useState(false); const [del, setDel] = useState(false); const [find, setFind] = useState(sp.get("find") === "1"); const [add, setAdd] = useState(false);
  const [groups, setGroups] = useState<string[]>(Object.keys(ROLE_GROUPS)); const [busy, setBusy] = useState(false);
  const toast = useToast(); const router = useRouter(); const { me } = useMe();
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;
  const c = data.company; const w = canWrite(me);
  const startFind = async () => {
    setBusy(true);
    try { const r = await api<{ job: Any; missing: string[] }>(`/api/companies/${id}/find-decision-makers`, { method: "POST", json: { roleGroups: groups, projectId: sp.get("project") ?? undefined } });
      if (r.missing.length) toast("error", `Cannot research yet — missing: ${r.missing.join("; ")}`); else toast("success", "Decision-maker research started.");
      router.push(`/discovery?job=${r.job.id}`);
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title={c.name} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge>{human(c.company_type)}</Badge>{c.industry && <span>{c.industry}</span>}{c.headquarters && <span>HQ: {c.headquarters}</span>}<DemoBadge show={c.is_demo} /></span>}
        actions={<>{w && <button className="btn-primary" onClick={() => setFind(true)}><Users className="h-4 w-4" />Find decision makers</button>}{w && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</button>}{isManager(me) && <button className="btn-secondary text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></button>}</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4"><div className="card-t mb-2">Company information</div>
          <dl className="kv">
            <dt>Website</dt><dd><ExternalLink href={c.website} /></dd><dt>LinkedIn</dt><dd><ExternalLink href={c.linkedin_url} /></dd>
            <dt>Official email (company-level)</dt><dd>{c.official_email ?? "—"}</dd><dt>Official phone</dt><dd>{c.official_phone ?? "—"}</dd>
            <dt>Procurement department</dt><dd>{c.procurement_department ?? "—"}</dd><dt>Vendor registration</dt><dd><ExternalLink href={c.vendor_registration_url} /></dd>
            <dt>Registered address</dt><dd>{c.registered_address ?? "—"}</dd><dt>Office locations</dt><dd>{c.office_locations?.join(", ") || "—"}</dd>
            <dt>Company size</dt><dd>{c.company_size ?? "—"}</dd><dt>Business category</dt><dd>{c.business_category ?? "—"}</dd>
            <dt>Expansion activity</dt><dd className="whitespace-pre-wrap">{c.expansion_activity ?? "—"}</dd><dt>Research date</dt><dd>{fmtDate(c.research_date)}</dd>
          </dl>
          {data.sources.length > 0 && <div className="mt-2"><div className="label">Sources</div>{data.sources.map((s) => <div key={s.id} className="text-xs"><ExternalLink href={s.url}>{s.title ?? s.url}</ExternalLink></div>)}</div>}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="card"><div className="card-h"><span className="card-t">Decision makers ({data.contacts.length})</span>{w && <button className="btn-secondary btn-xs" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" />Add contact</button>}</div>
            <table className="tbl"><thead><tr><th>Name</th><th>Designation</th><th>Company email</th><th>Direct email</th><th>Verification</th><th>Phone</th></tr></thead><tbody>
              {data.contacts.map((x) => <tr key={x.id} className="cursor-pointer" onClick={() => router.push(`/contacts?open=${x.id}`)}><td className="font-medium">{x.full_name}</td><td>{x.designation ?? "—"}</td><td className="text-xs">{x.company_email ?? "—"}</td><td className="text-xs">{x.direct_email ?? "—"}</td><td><Badge tone={x.email_verification_status}>{human(x.email_verification_status)}</Badge></td><td className="text-xs">{x.professional_phone ?? x.company_phone ?? "—"}<div className="text-slate-400">{human(x.phone_status)}</div></td></tr>)}
            </tbody></table>{data.contacts.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No contacts yet. Use “Find decision makers”.</div>}</div>
          <div className="card"><div className="card-h"><span className="card-t">Projects ({data.projects.length})</span></div><ul className="divide-y divide-slate-100">{data.projects.map((p) => <li key={p.id} className="px-4 py-2 text-sm"><Link href={`/projects/${p.id}`} className="flex items-center gap-2"><span className="flex-1 font-medium">{p.name}</span><span className="text-xs text-slate-500">{p.city}</span><Badge tone={p.opportunity_class}>{label(OPPORTUNITY_CLASSES, p.opportunity_class)}</Badge><ScorePill score={p.lead_score} /></Link></li>)}{data.projects.length === 0 && <li className="p-4 text-center text-sm text-slate-400">No projects as client</li>}</ul></div>
          {data.stakeholderOf.length > 0 && <div className="card"><div className="card-h"><span className="card-t">Stakeholder in</span></div><ul className="divide-y divide-slate-100">{data.stakeholderOf.map((s, i) => <li key={i} className="px-4 py-2 text-sm"><Badge>{human(s.role)}</Badge> <Link className="hover:underline" href={`/projects/${s.project?.id}`}>{s.project?.name}</Link> <span className="text-xs text-slate-500">{s.project?.city}</span></li>)}</ul></div>}
          <div className="card"><div className="card-h"><span className="card-t">Leads ({data.leads.length})</span></div><ul className="divide-y divide-slate-100">{data.leads.map((l) => <li key={l.id} className="px-4 py-2 text-sm"><Link href={`/leads/${l.id}`} className="flex items-center gap-2"><span className="font-mono text-xs">{l.lead_code}</span><span className="flex-1">{l.project_name}</span><span className="text-xs">{STAGE_LABEL[l.stage]}</span><ScorePill score={l.score} priority={l.priority} /></Link></li>)}</ul></div>
        </div>
      </div>
      <Modal open={find} onClose={() => setFind(false)} title={`Find decision makers at ${c.name}`} footer={<><button className="btn-secondary" onClick={() => setFind(false)}>Cancel</button><button className="btn-primary" disabled={busy || !groups.length} onClick={startFind}>{busy && <Spinner />}Start research</button></>}>
        <p className="mb-3 text-sm text-slate-600">Searches public web sources (company pages, news, public LinkedIn results via search) {c.domain ? <>and Hunter&apos;s publicly-sourced emails for <b>{c.domain}</b></> : <>— add the company website to also use Hunter domain search</>}. Only people named in a source are returned, and nothing is saved until you review it.</p>
        <div className="space-y-1.5">{Object.entries(ROLE_GROUPS).map(([k, g]) => <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={groups.includes(k)} onChange={(e) => setGroups(e.target.checked ? [...groups, k] : groups.filter((x) => x !== k))} /><span><b>{g.label}</b><span className="block text-xs text-slate-500">{g.titles.join(", ")}</span></span></label>)}</div>
      </Modal>
      <EntityFormModal open={edit} onClose={() => setEdit(false)} resource="companies" title="Edit company" initial={c} onSaved={() => reload()} />
      <EntityFormModal open={add} onClose={() => setAdd(false)} resource="contacts" title="Add contact" defaults={{ company_id: id }} onSaved={() => reload()} />
      <Confirm open={del} title="Delete company" message="Soft-delete this company? Linked projects and contacts are kept. Logged in the audit trail." onClose={() => setDel(false)} onConfirm={async () => { try { await api(`/api/r/companies/${id}?confirm=1`, { method: "DELETE" }); router.push("/companies"); } catch (e) { toast("error", (e as Error).message); } }} />
    </div>
  );
}
export default function CompanyDetail({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense><Inner id={id} /></Suspense>; }
