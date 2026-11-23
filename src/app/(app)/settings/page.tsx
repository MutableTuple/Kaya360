"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, PlugZap, Save, Trash2, KeyRound, ExternalLink as Ext } from "lucide-react";
import { api, useFetch, PageHeader, Tabs, Badge, Spinner, useToast, ErrorBox, fmtDate, Confirm, cn } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { PROJECT_CATEGORIES, SIZE_BANDS, ROLE_LABELS, ROLES } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, isAdmin, isManager } from "@/components/me";

type R = Record<string, any>;

function useSetting<T extends R>(key: string, settings: R) {
  const [v, setV] = useState<T>((settings[key] ?? {}) as T);
  useEffect(() => { if (settings[key]) setV(settings[key] as T); }, [settings[key]]);
  return [v, setV] as const;
}
function SaveBar({ k, value, disabled, onSaved }: { k: string; value: unknown; disabled?: boolean; onSaved: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  return <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={busy || disabled} onClick={async () => { setBusy(true); try { await api(`/api/settings/${k}`, { method: "PUT", json: value }); toast("success", "Settings saved."); onSaved(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); } }}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Save</button></div>;
}
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
function Multi({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div className="flex flex-wrap gap-1.5">{options.map((o) => <button type="button" key={o} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} className={cn("rounded-full border px-2.5 py-1 text-xs", value.includes(o) ? "border-navy-700 bg-navy-800 text-white" : "border-slate-300")}>{o}</button>)}</div>;
}

function Integrations() {
  const { data, error, reload } = useFetch<{ integrations: R[]; platform: R; canEdit: boolean }>("/api/integrations");
  const { settings, reload: rs } = useMe();
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({}); const [testing, setTesting] = useState<string | null>(null); const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [order, setOrder] = useState<string[]>(((settings.search_providers as R)?.order as string[]) ?? ["serper"]);
  const [limits, setLimits] = useState<Record<string, number>>((settings.usage_limits as Record<string, number>) ?? {});
  const toast = useToast();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  const pf = data.platform;
  const test = async (id: string) => { setTesting(id); try { const r = await api<{ detail: string; ms: number }>(`/api/integrations/${id}/test`, { method: "POST" }); setResults({ ...results, [id]: { ok: true, msg: `${r.detail} (${r.ms} ms)` } }); } catch (e) { setResults({ ...results, [id]: { ok: false, msg: (e as Error).message } }); } finally { setTesting(null); reload(); } };
  const groups = [...new Set(data.integrations.map((i) => i.category))];
  return (
    <div className="space-y-4">
      <div className="card p-4"><div className="card-t mb-2">Platform</div><div className="grid gap-2 text-sm sm:grid-cols-3">{([["Supabase (database & auth)", pf.supabase], ["Service role key (server-only)", pf.serviceRole], ["APP_ENCRYPTION_KEY", pf.encryptionKey], ["CRON_SECRET (scheduled jobs)", pf.cronSecret], ["Gmail reply tracking", pf.replyTracking]] as [string, boolean][]).map(([l, ok]) => <div key={l} className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-500" />}{l}</div>)}<div className="text-xs text-slate-500">App URL: {pf.appUrl}</div></div></div>
      {groups.map((g) => <div key={g}><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700">{g}</div><div className="grid gap-3 lg:grid-cols-2">
        {data.integrations.filter((i) => i.category === g).map((i) => (
          <div key={i.id} className="card p-4">
            <div className="flex items-start gap-2"><div className="flex-1"><div className="font-semibold text-navy-900">{i.name}</div><div className="text-xs text-slate-500">{i.description}</div></div>{i.configured ? <Badge tone="verified">{i.source === "environment" ? "Configured (env)" : i.source === "database" ? "Configured (encrypted DB)" : "No key needed"}</Badge> : <Badge tone="needs_configuration">Not configured</Badge>}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-slate-50 p-1.5"><div className="font-semibold">{i.usage.calls}</div>calls this month</div><div className="rounded bg-slate-50 p-1.5"><div className={cn("font-semibold", i.usage.failures && "text-red-600")}>{i.usage.failures}</div>errors</div><div className="rounded bg-slate-50 p-1.5"><div className="font-semibold">${i.usage.cost}</div>est. cost</div></div>
            {i.usage.lastError && <div className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">Last error ({fmtDate(i.usage.lastErrorAt, true)}): {i.usage.lastError}</div>}
            {data.canEdit && i.fields.length > 0 && <div className="mt-3 space-y-2">{i.fields.map((f: R) => <div key={f.name}><label className="label">{f.label} <code className="text-[10px] text-slate-400">{f.env}</code>{f.set && <span className="ml-1 text-[10px] text-emerald-700">set in environment</span>}</label><input className="input" type={f.secret ? "password" : "text"} autoComplete="off" placeholder={f.set ? "Using environment variable" : i.source === "database" ? "•••••• stored — enter to replace" : "Not set"} value={vals[i.id]?.[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [i.id]: { ...vals[i.id], [f.name]: e.target.value } })} /></div>)}</div>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(i.configured || i.keyless) && <button className="btn-secondary btn-xs" disabled={testing === i.id} onClick={() => test(i.id)}>{testing === i.id ? <Spinner /> : <PlugZap className="h-3.5 w-3.5" />}Test connection</button>}
              {data.canEdit && vals[i.id] && Object.values(vals[i.id]).some(Boolean) && <button className="btn-primary btn-xs" onClick={async () => { try { const r = await api<{ message: string }>(`/api/integrations/${i.id}`, { method: "PUT", json: { values: vals[i.id] } }); toast("success", r.message); setVals({ ...vals, [i.id]: {} }); reload(); } catch (e) { toast("error", (e as Error).message); } }}><KeyRound className="h-3.5 w-3.5" />Save key</button>}
              {data.canEdit && i.source === "database" && <button className="btn-ghost btn-xs text-red-600" onClick={async () => { await api(`/api/integrations/${i.id}`, { method: "DELETE" }); reload(); }}><Trash2 className="h-3.5 w-3.5" />Remove stored key</button>}
              {data.canEdit && <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">Monthly call limit<input className="input w-20 py-0.5 text-xs" type="number" min={0} value={limits[i.id] ?? 0} onChange={(e) => setLimits({ ...limits, [i.id]: Number(e.target.value) })} /></label>}
              <a className="text-[11px] text-navy-600 hover:underline" href={i.docs} target="_blank" rel="noopener noreferrer">Get credentials<Ext className="ml-0.5 inline h-3 w-3" /></a>
            </div>
            {results[i.id] && <div className={cn("mt-2 rounded p-2 text-xs", results[i.id].ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{results[i.id].msg}</div>}
          </div>))}
      </div></div>)}
      {data.canEdit && <div className="card p-4"><div className="card-t mb-2">Search provider fallback order & usage limits</div><p className="mb-2 text-xs text-slate-500">Discovery uses the first configured provider and falls back to (and merges results from) the next when it errors or returns too few results. 0 = no per-provider limit.</p>
        <div className="flex flex-wrap gap-2">{order.map((p, idx) => <div key={p} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm"><span className="text-slate-400">{idx + 1}.</span>{p}<button className="btn-ghost btn-xs" disabled={idx === 0} onClick={() => { const o = [...order]; [o[idx - 1], o[idx]] = [o[idx], o[idx - 1]]; setOrder(o); }}>↑</button></div>)}</div>
        <div className="flex justify-end gap-2"><SaveBar k="search_providers" value={{ order }} onSaved={rs} /><SaveBar k="usage_limits" value={limits} onSaved={rs} /></div></div>}
      <p className="text-xs text-slate-500">Keys entered here are encrypted with AES-256-GCM on the server and never sent back to the browser. Environment variables always take precedence.</p>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams(); const { me, settings, reload } = useMe(); const toast = useToast();
  const [tab, setTab] = useState(sp.get("tab") ?? "company");
  const [company, setCompany] = useSetting<R>("company", settings); const [lg, setLg] = useSetting<R>("lead_generation", settings);
  const [w, setW] = useSetting<Record<string, number>>("scoring_weights", settings); const [auto, setAuto] = useSetting<R>("automation", settings);
  const [demoBusy, setDemoBusy] = useState(false); const [delDemo, setDelDemo] = useState(false);
  const admin = isAdmin(me); const total = Object.values(w).reduce((a, b) => a + Number(b), 0);
  if (!me) return <Spinner />;
  return (
    <div>
      <PageHeader title="Settings" subtitle={admin ? "Administrator settings" : "Read-only — only administrators can change settings."} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "company", label: "Company" }, { id: "leadgen", label: "Lead generation" }, { id: "scoring", label: "Lead scoring" }, { id: "automation", label: "Automation" }, { id: "integrations", label: "Integrations" }, ...(isManager(me) ? [{ id: "usage", label: "Usage & error logs" }, { id: "audit", label: "Audit log" }] : []), ...(admin ? [{ id: "demo", label: "Demo data" }] : [])]} />
      <fieldset disabled={!admin && tab !== "integrations"}>
        {tab === "company" && <div className="card max-w-3xl p-4"><div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Company name</label><input className="input" value={company.name ?? ""} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div><label className="label">Website</label><input className="input" value={company.website ?? ""} onChange={(e) => setCompany({ ...company, website: e.target.value })} /></div>
          <div><label className="label">Logo URL</label><input className="input" value={company.logo_url ?? ""} onChange={(e) => setCompany({ ...company, logo_url: e.target.value || null })} /></div>
          <div><label className="label">Business address</label><input className="input" value={company.address ?? ""} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Company introduction (used in email templates)</label><textarea className="input" rows={4} value={company.introduction ?? ""} onChange={(e) => setCompany({ ...company, introduction: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Services (comma separated)</label><textarea className="input" rows={2} value={(company.services ?? []).join(", ")} onChange={(e) => setCompany({ ...company, services: list(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Target markets</label><input className="input" value={(company.target_markets ?? []).join(", ")} onChange={(e) => setCompany({ ...company, target_markets: list(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Preferred project categories</label><Multi options={[...PROJECT_CATEGORIES]} value={company.preferred_categories ?? []} onChange={(v) => setCompany({ ...company, preferred_categories: v })} /></div>
        </div>{admin && <SaveBar k="company" value={company} onSaved={reload} />}</div>}
        {tab === "leadgen" && <div className="card max-w-3xl p-4"><div className="grid gap-3">
          <div><label className="label">Preferred states</label><Multi options={STATES.map((s) => s.name)} value={lg.preferred_states ?? []} onChange={(v) => setLg({ ...lg, preferred_states: v })} /></div>
          <div><label className="label">Preferred cities</label><input className="input" value={(lg.preferred_cities ?? []).join(", ")} onChange={(e) => setLg({ ...lg, preferred_cities: list(e.target.value) })} /></div>
          <div><label className="label">Project sizes</label><Multi options={SIZE_BANDS.map((s) => s[0])} value={lg.project_sizes ?? []} onChange={(v) => setLg({ ...lg, project_sizes: v })} /></div>
          <div className="grid grid-cols-3 gap-3"><div><label className="label">Max queries per job</label><input className="input" type="number" value={lg.max_queries_per_job ?? 24} onChange={(e) => setLg({ ...lg, max_queries_per_job: Number(e.target.value) })} /></div><div><label className="label">Pages read per query</label><input className="input" type="number" value={lg.max_pages_per_query ?? 4} onChange={(e) => setLg({ ...lg, max_pages_per_query: Number(e.target.value) })} /></div><div><label className="label">Monthly API budget (USD, 0 = none)</label><input className="input" type="number" value={lg.monthly_api_budget_usd ?? 50} onChange={(e) => setLg({ ...lg, monthly_api_budget_usd: Number(e.target.value) })} /></div></div>
        </div>{admin && <SaveBar k="lead_generation" value={lg} onSaved={reload} />}</div>}
        {tab === "scoring" && <div className="card max-w-xl p-4"><p className="mb-3 text-sm text-slate-600">Weights must total 100. Missing or unverified information always scores zero for its criterion.</p>
          {Object.entries({ confirmed_project: "Confirmed upcoming/ongoing project", confirmed_interior_requirement: "Confirmed interior execution requirement", decision_maker: "Relevant decision-maker identified", verified_contact: "Verified business contact", priority_region: "West or North India location", external_contractor_potential: "External contractor appointment potential", execution_readiness: "Execution readiness" }).map(([k, l]) => <div key={k} className="mb-2 flex items-center justify-between gap-3"><span className="text-sm">{l}</span><input className="input w-20" type="number" min={0} max={50} value={w[k] ?? 0} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></div>)}
          <div className={cn("text-right text-sm font-semibold", total === 100 ? "text-emerald-700" : "text-red-600")}>Total: {total}/100</div>
          {admin && <SaveBar k="scoring_weights" value={w} disabled={total !== 100} onSaved={reload} />}<p className="text-xs text-slate-500">After changing weights, use “Rescore” on selected leads (Lead Database) — the weekly job also rescoring warm/hot leads.</p></div>}
        {tab === "automation" && <div className="card max-w-3xl p-4">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!auto.enabled} onChange={(e) => setAuto({ ...auto, enabled: e.target.checked })} />Enable scheduled discovery (runs real searches and consumes API credits)</label>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div><div className="label">Daily</div>{["discover_projects", "discover_tenders"].map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!auto.daily?.[k]} onChange={(e) => setAuto({ ...auto, daily: { ...auto.daily, [k]: e.target.checked } })} />{k.replace(/_/g, " ")}</label>)}<label className="label mt-2">Max scheduled jobs/day</label><input className="input" type="number" value={auto.daily?.max_jobs ?? 2} onChange={(e) => setAuto({ ...auto, daily: { ...auto.daily, max_jobs: Number(e.target.value) } })} /></div>
            <div><div className="label">Weekly</div>{["refresh_hot_leads", "deadline_check", "report"].map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto.weekly?.[k] !== false} onChange={(e) => setAuto({ ...auto, weekly: { ...auto.weekly, [k]: e.target.checked } })} />{k.replace(/_/g, " ")}</label>)}</div>
            <div><div className="label">Monthly</div>{["performance_report", "inactive_leads"].map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto.monthly?.[k] !== false} onChange={(e) => setAuto({ ...auto, monthly: { ...auto.monthly, [k]: e.target.checked } })} />{k.replace(/_/g, " ")}</label>)}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div><label className="label">Target geography</label><select className="input" value={auto.geography?.region ?? "west"} onChange={(e) => setAuto({ ...auto, geography: { ...auto.geography, region: e.target.value } })}><option value="all">All India</option><option value="west">West India</option><option value="north">North India</option><option value="states">States</option><option value="cities">Cities</option></select></div>
            <div className="sm:col-span-2"><label className="label">{auto.geography?.region === "states" ? "States" : "Cities"} (comma separated)</label><input className="input" value={((auto.geography?.region === "states" ? auto.geography?.states : auto.geography?.cities) ?? []).join(", ")} onChange={(e) => setAuto({ ...auto, geography: { ...auto.geography, states: auto.geography?.region === "states" ? list(e.target.value) : auto.geography?.states ?? [], cities: auto.geography?.region !== "states" ? list(e.target.value) : auto.geography?.cities ?? [] } })} /></div>
            <div><label className="label">Searches per scheduled job</label><input className="input" type="number" value={auto.queries_per_run ?? 12} onChange={(e) => setAuto({ ...auto, queries_per_run: Number(e.target.value) })} /></div>
            <div className="sm:col-span-2"><label className="label">Notify roles</label><Multi options={[...ROLES]} value={auto.notify_roles ?? []} onChange={(v) => setAuto({ ...auto, notify_roles: v })} /><div className="text-[10px] text-slate-400">{(auto.notify_roles ?? []).map((r: string) => ROLE_LABELS[r as keyof typeof ROLE_LABELS]).join(", ")}</div></div>
            <div className="sm:col-span-3"><label className="label">Project categories</label><Multi options={[...PROJECT_CATEGORIES]} value={auto.categories ?? []} onChange={(v) => setAuto({ ...auto, categories: v })} /></div>
          </div>
          {admin && <SaveBar k="automation" value={{ enabled: !!auto.enabled, queries_per_run: auto.queries_per_run ?? 12, categories: auto.categories ?? [], notify_roles: auto.notify_roles ?? [], geography: { region: auto.geography?.region ?? "west", states: auto.geography?.states ?? [], cities: auto.geography?.cities ?? [] }, daily: { discover_projects: !!auto.daily?.discover_projects, discover_tenders: !!auto.daily?.discover_tenders, max_jobs: auto.daily?.max_jobs ?? 2 }, weekly: { refresh_hot_leads: auto.weekly?.refresh_hot_leads !== false, deadline_check: auto.weekly?.deadline_check !== false, report: auto.weekly?.report !== false }, monthly: { performance_report: auto.monthly?.performance_report !== false, inactive_leads: auto.monthly?.inactive_leads !== false } }} onSaved={reload} />}
          <p className="text-xs text-slate-500">Schedules are triggered by Vercel Cron (vercel.json) or Supabase pg_cron calling /api/cron/&lt;tick|daily|weekly|monthly&gt; with CRON_SECRET. Duplicate projects are never re-created (database unique constraints).</p>
        </div>}
      </fieldset>
      {tab === "integrations" && <Integrations />}
      {tab === "usage" && <DataTable<R> resource="integration_usage" columns={[{ key: "created_at", header: "When", sortable: true, render: (r) => fmtDate(r.created_at, true) }, { key: "provider", header: "Provider" }, { key: "operation", header: "Operation" }, { key: "success", header: "Result", render: (r) => <Badge tone={r.success ? "verified" : "failed"}>{r.success ? "OK" : "Error"}</Badge> }, { key: "units", header: "Units" }, { key: "est_cost_usd", header: "Est. cost", render: (r) => `$${Number(r.est_cost_usd).toFixed(4)}` }, { key: "error", header: "Error", render: (r) => <span className="text-xs text-red-700">{r.error}</span> }]} filters={[{ key: "provider", label: "Provider", type: "select", options: ["openai", "serper", "nominatim"].map((x) => [x, x] as const) }, { key: "failed", label: "Errors only", type: "bool" }, { key: "from", label: "From", type: "date" }]} />}
      {tab === "audit" && <DataTable<R> resource="audit_logs" columns={[{ key: "created_at", header: "When", sortable: true, render: (r) => fmtDate(r.created_at, true) }, { key: "actor_email", header: "User", render: (r) => r.actor_email ?? "System" }, { key: "action", header: "Action", render: (r) => <Badge>{r.action}</Badge> }, { key: "table_name", header: "Table" }, { key: "record_id", header: "Record", render: (r) => <span className="font-mono text-[10px]">{r.record_id}</span> }, { key: "changed_fields", header: "Changed fields", render: (r) => <span className="text-xs">{(r.changed_fields ?? []).join(", ")}</span> }]} filters={[{ key: "table", label: "Table", type: "select", options: ["leads", "projects", "companies", "contacts", "tenders", "follow_ups", "profiles", "application_settings", "integration_secrets"].map((x) => [x, x] as const) }, { key: "action", label: "Action", type: "select", options: ["INSERT", "UPDATE", "DELETE", "SOFT_DELETE", "RESTORE", "EXPORT", "CONFIG", "SEND"].map((x) => [x, x] as const) }]} />}
      {tab === "demo" && admin && <div className="card max-w-xl p-4 text-sm"><p>Load a small set of sample records for training and testing. Every record is flagged <Badge tone="demo">DEMO</Badge>, prefixed “[DEMO]”, uses example.com addresses, and is excluded from reports and analytics by default. Demo data is never mixed with discovered leads.</p>
        <div className="mt-3 flex gap-2"><button className="btn-primary" disabled={demoBusy} onClick={async () => { setDemoBusy(true); try { const r = await api<{ message: string }>("/api/demo", { method: "POST" }); toast("success", r.message); } catch (e) { toast("error", (e as Error).message); } finally { setDemoBusy(false); } }}>{demoBusy && <Spinner />}Load demo data</button><button className="btn-secondary text-red-600" onClick={() => setDelDemo(true)}>Remove all demo data</button></div>
        <Confirm open={delDemo} title="Remove demo data" message="Permanently delete every record flagged DEMO? Real records are not affected." onClose={() => setDelDemo(false)} onConfirm={async () => { try { const r = await api<{ message: string }>("/api/demo", { method: "DELETE" }); toast("success", r.message); } catch (e) { toast("error", (e as Error).message); } setDelDemo(false); }} /></div>}
    </div>
  );
}
export default function SettingsPage() { return <Suspense><Inner /></Suspense>; }
