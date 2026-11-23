"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus, Trash2, Plus } from "lucide-react";
import { api, useFetch, PageHeader, Badge, Spinner, ErrorBox, useToast, Modal, fmtDate, Tabs } from "@/components/ui";
import { ROLES, ROLE_LABELS, PROJECT_CATEGORIES } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, isAdmin, isManager } from "@/components/me";

type U = Record<string, any>;
const PERMS: [string, string[]][] = [["View all data", ["administrator", "bd_manager", "sales_executive", "researcher", "viewer"]], ["Create & edit records, run discovery, verify, send email", ["administrator", "bd_manager", "sales_executive", "researcher"]], ["Delete records, view audit trail & API usage, assign territories", ["administrator", "bd_manager"]], ["Invite users, change roles, settings & integrations, demo data", ["administrator"]]];

function Inner() {
  const sp = useSearchParams(); const { me, reload: reloadMe } = useMe(); const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ users: U[] }>("/api/team");
  const { data: asg, reload: reloadAsg } = useFetch<{ rows: U[] }>("/api/r/team_assignments?pageSize=500");
  const [tab, setTab] = useState(sp.get("me") ? "profile" : "users"); const [inv, setInv] = useState(false);
  const [f, setF] = useState({ email: "", full_name: "", role: "sales_executive", designation: "" }); const [busy, setBusy] = useState(false);
  const [prof, setProf] = useState<U | null>(null); const [na, setNa] = useState({ user_id: "", scope: "state", scope_value: "" });
  const patch = async (id: string, body: U) => { try { await api(`/api/team/${id}`, { method: "PATCH", json: body }); toast("success", "Updated."); reload(); if (id === me?.id) reloadMe(); } catch (e) { toast("error", (e as Error).message); } };
  if (error) return <ErrorBox error={error} />;
  const self = data?.users.find((u) => u.id === me?.id); const p = prof ?? self;
  return (
    <div>
      <PageHeader title="Team Management" subtitle="Users, roles, permissions and territory assignments." actions={isAdmin(me) && <button className="btn-primary" onClick={() => setInv(true)}><UserPlus className="h-4 w-4" />Invite user</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "users", label: "Users" }, { id: "assign", label: "Assignments" }, { id: "perms", label: "Roles & permissions" }, { id: "profile", label: "My profile" }]} />
      {tab === "users" && (loading ? <Spinner /> : <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Leads</th><th>Hot</th><th>Awarded</th><th>Joined</th></tr></thead><tbody>
        {data!.users.map((u) => <tr key={u.id}><td className="font-medium">{u.full_name}<div className="text-xs text-slate-500">{u.designation}</div></td><td>{u.email}</td>
          <td>{isAdmin(me) && u.id !== me?.id ? <select className="input w-auto py-1 text-xs" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select> : <Badge>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</Badge>}</td>
          <td>{isAdmin(me) && u.id !== me?.id ? <button className="btn-ghost btn-xs" onClick={() => patch(u.id, { is_active: !u.is_active })}><Badge tone={u.is_active ? "verified" : "cancelled"}>{u.is_active ? "Active" : "Deactivated"}</Badge></button> : <Badge tone={u.is_active ? "verified" : "cancelled"}>{u.is_active ? "Active" : "Deactivated"}</Badge>}</td>
          <td className="tabular-nums">{u.stats.leads}</td><td className="tabular-nums">{u.stats.hot}</td><td className="tabular-nums">{u.stats.awarded}</td><td>{fmtDate(u.created_at)}</td></tr>)}
      </tbody></table></div>)}
      {tab === "assign" && <div className="card">
        {isManager(me) && <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <div><label className="label">Employee</label><select className="input" value={na.user_id} onChange={(e) => setNa({ ...na, user_id: e.target.value })}><option value="">Select…</option>{data?.users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}</select></div>
          <div><label className="label">Scope</label><select className="input" value={na.scope} onChange={(e) => setNa({ ...na, scope: e.target.value, scope_value: "" })}><option value="state">State</option><option value="city">City</option><option value="category">Project category</option></select></div>
          <div><label className="label">Value</label>{na.scope === "state" ? <select className="input" value={na.scope_value} onChange={(e) => setNa({ ...na, scope_value: e.target.value })}><option value="">Select…</option>{STATES.map((s) => <option key={s.name}>{s.name}</option>)}</select> : na.scope === "category" ? <select className="input" value={na.scope_value} onChange={(e) => setNa({ ...na, scope_value: e.target.value })}><option value="">Select…</option>{PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select> : <input className="input" value={na.scope_value} onChange={(e) => setNa({ ...na, scope_value: e.target.value })} />}</div>
          <button className="btn-primary" disabled={!na.user_id || !na.scope_value} onClick={async () => { try { await api("/api/r/team_assignments", { method: "POST", json: na }); setNa({ ...na, scope_value: "" }); reloadAsg(); } catch (e) { toast("error", (e as Error).message); } }}><Plus className="h-4 w-4" />Assign</button>
        </div>}
        <table className="tbl"><thead><tr><th>Employee</th><th>Scope</th><th>Value</th><th></th></tr></thead><tbody>{(asg?.rows ?? []).map((a) => <tr key={a.id}><td>{data?.users.find((u) => u.id === a.user_id)?.full_name ?? a.user_id}</td><td>{a.scope}</td><td>{a.scope_value}</td><td>{isManager(me) && <button className="btn-ghost btn-xs text-red-600" onClick={async () => { await api(`/api/r/team_assignments/${a.id}?confirm=1`, { method: "DELETE" }); reloadAsg(); }}><Trash2 className="h-3.5 w-3.5" /></button>}</td></tr>)}</tbody></table>
        {(asg?.rows ?? []).length === 0 && <div className="p-6 text-center text-sm text-slate-400">No territory assignments. Individual leads are assigned from the lead database or pipeline.</div>}
      </div>}
      {tab === "perms" && <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead><tbody>{PERMS.map(([l, rs]) => <tr key={l}><td>{l}</td>{ROLES.map((r) => <td key={r} className="text-center">{rs.includes(r) ? "✓" : "—"}</td>)}</tr>)}</tbody></table><p className="p-3 text-xs text-slate-500">Enforced in the database by Row Level Security and in every API route — not only in the interface.</p></div>}
      {tab === "profile" && p && <div className="card max-w-lg p-4">
        <div className="grid gap-3">
          <div><label className="label">Full name</label><input className="input" value={p.full_name ?? ""} onChange={(e) => setProf({ ...p, full_name: e.target.value })} /></div>
          <div><label className="label">Designation (used in email signatures)</label><input className="input" value={p.designation ?? ""} onChange={(e) => setProf({ ...p, designation: e.target.value })} /></div>
          <div><label className="label">Phone (used in email signatures)</label><input className="input" value={p.phone ?? ""} onChange={(e) => setProf({ ...p, phone: e.target.value })} /></div>
          <div className="text-xs text-slate-500">{p.email} · {ROLE_LABELS[p.role as keyof typeof ROLE_LABELS]}</div>
          <button className="btn-primary w-fit" onClick={() => patch(p.id, { full_name: p.full_name, designation: p.designation || null, phone: p.phone || null })}>Save profile</button>
        </div>
      </div>}
      <Modal open={inv} onClose={() => setInv(false)} title="Invite a team member" footer={<><button className="btn-secondary" onClick={() => setInv(false)}>Cancel</button><button className="btn-primary" disabled={busy || !f.email || !f.full_name} onClick={async () => { setBusy(true); try { const r = await api<{ message: string }>("/api/team", { method: "POST", json: f }); toast("success", r.message); setInv(false); reload(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); } }}>{busy && <Spinner />}Send invitation</button></>}>
        <div className="grid gap-3"><div><label className="label">Full name</label><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div><div><label className="label">Work email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div><div><label className="label">Designation</label><input className="input" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></div><div><label className="label">Role</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div><p className="text-xs text-slate-500">Supabase emails an invitation link; the user sets their password on first sign-in.</p></div>
      </Modal>
    </div>
  );
}
export default function TeamPage() { return <Suspense><Inner /></Suspense>; }
