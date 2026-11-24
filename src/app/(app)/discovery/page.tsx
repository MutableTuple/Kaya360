"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sparkles, Pause, Play, Square, Save, X, ExternalLink as Ext, RotateCcw, History, AlertTriangle } from "lucide-react";
import { api, useFetch, PageHeader, Badge, Spinner, ErrorBox, ScorePill, useToast, fmtDate, human, cn, Tabs, ExternalLink, ApiError } from "@/components/ui";
import { PROJECT_CATEGORIES, PROJECT_STAGES, RESEARCH_PERIODS, SIZE_BANDS, DISCOVERY_KEYWORDS, TENDER_CATEGORIES, OPPORTUNITY_CLASSES, label } from "@/lib/constants";
import { STATES } from "@/lib/geo";
import { useMe, canWrite } from "@/components/me";

type Job = { id: string; kind: string; title: string; status: string; params: Record<string, unknown>; queries: { q: string; status: string; results?: number; providers?: string[]; error?: string }[]; cursor: number; stats: Record<string, number>; errors: { at: string; message: string; query?: string; url?: string }[]; created_at: string; started_at: string | null; finished_at: string | null };
type Result = { id: string; result_type: string; title: string; payload: Record<string, any>; source_url: string; source_title: string | null; opportunity_class: string | null; preview_score: number | null; review_status: string; duplicate_of: string | null; duplicate_reason: string | null; saved_record_id: string | null };

function Chips({ options, value, onChange }: { options: readonly (readonly [string, string])[] | readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const opts = (options as readonly unknown[]).map((o) => (Array.isArray(o) ? o : [o, o])) as [string, string][];
  return <div className="flex flex-wrap gap-1.5">{opts.map(([v, l]) => { const on = value.includes(v); return <button type="button" key={v} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-navy-700 bg-navy-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-navy-400")}>{l}</button>; })}</div>;
}

function Panel({ onStarted }: { onStarted: (id: string) => void }) {
  const toast = useToast();
  const { data: status } = useFetch<Record<string, string[]>>("/api/discovery/status");
  const [kind, setKind] = useState<"projects" | "tenders">("projects");
  const [scope, setScope] = useState("west"); const [states, setStates] = useState<string[]>([]); const [cities, setCities] = useState(""); const [custom, setCustom] = useState("");
  const [cats, setCats] = useState<string[]>(["Corporate offices", "Commercial office interiors"]); const [stages, setStages] = useState<string[]>([]);
  const [period, setPeriod] = useState("30d"); const [sizes, setSizes] = useState<string[]>([]); const [kws, setKws] = useState<string[]>([]); const [customQ, setCustomQ] = useState(""); const [maxQ, setMaxQ] = useState(12);
  const [busy, setBusy] = useState(false);
  const missing = status?.[kind] ?? [];
  const start = async () => {
    setBusy(true);
    try {
      const geography = scope === "states" ? { scope, states } : scope === "cities" ? { scope, cities: cities.split(",").map((c) => c.trim()).filter(Boolean) } : scope === "custom" ? { scope, custom } : { scope };
      const r = await api<{ job: Job; missing: string[] }>("/api/discovery/jobs", { method: "POST", json: { kind, geography, categories: cats, stages, period, sizes, keywords: kws, customQuery: customQ || undefined, maxQueries: maxQ } });
      if (r.missing.length) toast("error", `Job saved but cannot run: missing ${r.missing.join("; ")}.`); else toast("success", "Discovery started.");
      onStarted(r.job.id);
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["projects", "tenders"] as const).map((k) => <button key={k} className={cn(kind === k ? "btn-primary" : "btn-secondary", "btn-xs")} onClick={() => { setKind(k); setCats(k === "tenders" ? ["Interior works", "Commercial fit-out"] : ["Corporate offices", "Commercial office interiors"]); }}>{k === "projects" ? "Projects" : "Tenders & RFQs"}</button>)}
        <span className="text-xs text-slate-500">Decision-maker research starts from a company page.</span>
      </div>
      {missing.length > 0 && <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Configuration required before research can run</div><ul className="ml-6 mt-1 list-disc">{missing.map((m) => <li key={m}>{m}</li>)}</ul><Link href="/settings?tab=integrations" className="mt-1 inline-block underline">Open Settings → Integrations</Link></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div><div className="label">Geography</div>
            <div className="flex flex-wrap gap-1.5">{[["all", "All India"], ["west", "West India"], ["north", "North India"], ["states", "Select states"], ["cities", "Select cities"], ["custom", "Custom"]].map(([v, l]) => <button key={v} type="button" onClick={() => setScope(v)} className={cn("rounded-lg border px-2.5 py-1 text-xs", scope === v ? "border-navy-700 bg-navy-50 font-semibold text-navy-800" : "border-slate-300")}>{l}</button>)}</div>
            {scope === "states" && <div className="mt-2"><Chips options={STATES.map((s) => s.name)} value={states} onChange={setStates} /></div>}
            {scope === "cities" && <input className="input mt-2" placeholder="Mumbai, Thane, Pune, Gurugram" value={cities} onChange={(e) => setCities(e.target.value)} />}
            {scope === "custom" && <input className="input mt-2" placeholder="e.g. BKC Mumbai, Hinjewadi Pune, Cyber City Gurugram" value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </div>
          <div><div className="label">{kind === "projects" ? "Project categories" : "Tender categories"}</div><Chips options={kind === "projects" ? PROJECT_CATEGORIES : TENDER_CATEGORIES} value={cats} onChange={setCats} /></div>
        </div>
        <div className="space-y-3">
          {kind === "projects" && <div><div className="label">Project stage</div><Chips options={PROJECT_STAGES.filter((s) => !["completed", "unknown"].includes(s[0]))} value={stages} onChange={setStages} /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><div className="label">Research period</div><select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>{RESEARCH_PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><div className="label">Search queries (cost control)</div><input className="input" type="number" min={1} max={100} value={maxQ} onChange={(e) => setMaxQ(Number(e.target.value))} /></div>
          </div>
          {kind === "projects" && <div><div className="label">Project size</div><Chips options={SIZE_BANDS} value={sizes} onChange={setSizes} /></div>}
          <div><div className="label">Keywords</div><Chips options={DISCOVERY_KEYWORDS} value={kws} onChange={setKws} /></div>
          <div><div className="label">Custom search query</div><input className="input" placeholder='e.g. "leases 1 lakh sq ft" office Mumbai' value={customQ} onChange={(e) => setCustomQ(e.target.value)} /></div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">Searches multiple providers, reads public sources and extracts opportunities. Results are not saved until you review them.</p>
        <button className="btn-primary px-5 py-2.5 text-base" disabled={busy || (scope === "states" && !states.length)} onClick={start}>{busy ? <Spinner /> : <Sparkles className="h-5 w-5" />}DISCOVER NEW {kind === "projects" ? "PROJECTS" : "TENDERS"}</button>
      </div>
    </div>
  );
}

function JobView({ id }: { id: string }) {
  const toast = useToast(); const { me } = useMe();
  const [review, setReview] = useState("pending");
  const { data, error, reload, setData } = useFetch<{ job: Job; results: Result[]; tally: Record<string, number> }>(`/api/discovery/jobs/${id}?review=${review}`, [review]);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<Result | null>(null);
  const stepping = useRef(false);
  const job = data?.job;
  // Drive the job while this page is open (the scheduled tick also advances it when nobody is watching).
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let alive = true;
    const loop = async () => {
      if (stepping.current) return; stepping.current = true;
      try { await api(`/api/discovery/jobs/${id}/step`, { method: "POST" }); } catch (e) { if ((e as ApiError).status !== 409) toast("error", (e as Error).message); }
      finally { stepping.current = false; if (alive) reload(); }
    };
    const t = setTimeout(loop, 600); const poll = setInterval(loop, 8000); // re-drive even if another worker held the lease
    return () => { alive = false; clearTimeout(t); clearInterval(poll); };
  }, [job?.status, job?.cursor, id]);
  const act = async (action: string) => { try { const r = await api<{ job: Job }>(`/api/discovery/jobs/${id}`, { method: "PATCH", json: { action } }); setData(data ? { ...data, job: r.job } : null); toast("success", `Job ${r.job.status}.`); } catch (e) { toast("error", (e as Error).message); } };
  const resultAct = async (action: string, ids: string[]) => {
    setBusy(true);
    try { const r = await api<{ saved: number; failed: number; results: { message: string; ok: boolean }[] }>("/api/discovery/results", { method: "POST", json: { action, ids } }); toast(r.failed ? "error" : "success", `${r.saved} ${action === "reject" ? "rejected" : "processed"}${r.failed ? `, ${r.failed} failed: ${r.results.filter((x) => !x.ok).map((x) => x.message).slice(0, 3).join("; ")}` : ""}`); setSel(new Set()); reload(); }
    catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!job) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
  const st = job.stats; const pct = job.queries.length ? Math.round((job.cursor / job.queries.length) * 100) : 0;
  const results = data!.results;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-semibold text-navy-900">{job.title}</h2><Badge tone={job.status}>{human(job.status)}</Badge>{job.status === "running" && <Spinner className="text-navy-600" />}</div><div className="text-xs text-slate-500">Started {fmtDate(job.started_at ?? job.created_at, true)}{job.finished_at && ` · finished ${fmtDate(job.finished_at, true)}`}</div></div>
          {canWrite(me) && <div className="flex gap-2">
            {job.status === "running" && <button className="btn-secondary" onClick={() => act("pause")}><Pause className="h-4 w-4" />Pause</button>}
            {job.status === "paused" && <button className="btn-secondary" onClick={() => act("resume")}><Play className="h-4 w-4" />Resume</button>}
            {["needs_configuration", "failed"].includes(job.status) && <button className="btn-secondary" onClick={() => act("retry")}><RotateCcw className="h-4 w-4" />Retry</button>}
            {["running", "paused", "queued", "needs_configuration"].includes(job.status) && <button className="btn-secondary text-red-600" onClick={() => act("cancel")}><Square className="h-4 w-4" />Cancel</button>}
          </div>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-600 transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-8">
          {[["Search queries executed", st.queries_executed, `of ${job.queries.length}`], ["Websites researched", st.websites_researched], [job.kind === "tenders" ? "Tenders identified" : "Projects identified", st.projects_identified], ["Companies identified", st.companies_identified], ["Contacts discovered", st.contacts_discovered], ["Duplicates removed", st.duplicates_removed], ["Awaiting review", st.awaiting_review], ["API errors", st.api_errors]].map(([l, v, h]) => (
            <div key={String(l)} className={cn("rounded-lg border border-slate-100 p-2", l === "API errors" && Number(v) > 0 && "border-red-200 bg-red-50")}><div className="text-lg font-semibold tabular-nums text-navy-900">{v ?? 0}</div><div className="text-[10px] uppercase leading-tight text-slate-500">{l} {h}</div></div>
          ))}
        </div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs font-medium text-slate-600">Queries ({job.queries.length}) & errors ({job.errors.length})</summary>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">{job.queries.map((q, i) => <li key={i} className="flex gap-2"><Badge tone={q.status === "done" ? "completed" : q.status === "error" ? "failed" : "queued"}>{q.status}</Badge><span className="flex-1">{q.q}</span><span className="text-slate-400">{q.results != null ? `${q.results} hits · ${q.providers?.join(", ")}` : ""}</span></li>)}</ul>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-red-700">{job.errors.length === 0 ? <li className="text-slate-400">No errors</li> : job.errors.slice().reverse().map((e, i) => <li key={i}><span className="text-slate-400">{fmtDate(e.at, true)}</span> {e.message}{e.url && <> — <ExternalLink href={e.url} /></>}</li>)}</ul>
          </div>
        </details>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <span className="card-t">Results for review</span>
          <div className="flex gap-1">{["pending", "saved", "duplicate", "rejected", "all"].map((r) => <button key={r} className={cn("btn-xs", review === r ? "btn-primary" : "btn-secondary")} onClick={() => { setReview(r); setSel(new Set()); }}>{human(r)} {r !== "all" && data!.tally[r] ? `(${data!.tally[r]})` : ""}</button>)}</div>
          {canWrite(me) && sel.size > 0 && <div className="ml-auto flex gap-2">
            {review !== "duplicate" && <button className="btn-primary" disabled={busy} onClick={() => resultAct("save", [...sel])}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Save {sel.size} to database</button>}
            {review === "duplicate" && <button className="btn-secondary" disabled={busy} onClick={() => resultAct("merge_source", [...sel])}>Add as source to existing</button>}
            {review !== "rejected" ? <button className="btn-secondary" disabled={busy} onClick={() => resultAct("reject", [...sel])}><X className="h-4 w-4" />Reject</button> : <button className="btn-secondary" onClick={() => resultAct("restore", [...sel])}>Restore</button>}
          </div>}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="w-8"><input type="checkbox" checked={results.length > 0 && results.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(results.filter((r) => r.review_status !== "saved").map((r) => r.id)) : new Set())} /></th><th>{job.kind === "decision_makers" ? "Person" : job.kind === "tenders" ? "Tender" : "Project"}</th><th>Classification</th><th>Details</th><th>Score</th><th>Source</th><th>Status</th></tr></thead>
            <tbody>
              {results.map((r) => { const p = r.payload; return (
                <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={r.review_status === "saved"} checked={sel.has(r.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSel(s); }} /></td>
                  <td className="max-w-xs"><div className="font-medium text-slate-800">{r.title}</div><div className="text-xs text-slate-500">{r.result_type === "project" ? [p.client_company, p.city, p.state].filter(Boolean).join(" · ") : r.result_type === "tender" ? [p.organisation, p.reference_number].filter(Boolean).join(" · ") : [p.company, p.email].filter(Boolean).join(" · ")}</div></td>
                  <td>{r.opportunity_class ? <Badge tone={r.opportunity_class}>{label(OPPORTUNITY_CLASSES, r.opportunity_class)}</Badge> : r.result_type === "tender" ? <Badge tone={p.status}>{human(p.status)}</Badge> : <Badge>{p.source === "hunter" ? "Hunter (sourced)" : "Web source"}</Badge>}</td>
                  <td className="max-w-sm text-xs text-slate-600">{r.result_type === "project" ? [p.category, p.area_sqft && `${Number(p.area_sqft).toLocaleString("en-IN")} sq ft`, p.current_stage !== "unknown" && human(p.current_stage), p.contacts?.length && `${p.contacts.length} contact(s)`].filter(Boolean).join(" · ") : r.result_type === "tender" ? [p.submission_deadline && `Due ${fmtDate(p.submission_deadline)}`, p.location].filter(Boolean).join(" · ") : p.linkedin_url ? "LinkedIn profile" : ""}{p.client_contact ? <div className="mt-1 text-emerald-700">{[...(p.client_contact.emails ?? []).slice(0, 1), ...(p.client_contact.phones ?? []).slice(0, 1)].join(" · ")}</div> : r.result_type === "project" ? <div className="mt-1 text-slate-400">No contact found</div> : null}{p.grounding_notes?.length ? <div className="text-amber-700">{p.grounding_notes.length} field(s) removed — not in source</div> : null}</td>
                  <td>{r.preview_score != null ? <ScorePill score={r.preview_score} /> : "—"}</td>
                  <td className="max-w-[180px] text-xs" onClick={(e) => e.stopPropagation()}><ExternalLink href={r.source_url} /></td>
                  <td><Badge tone={r.review_status}>{human(r.review_status)}</Badge>{r.saved_record_id && r.result_type === "project" && <Link onClick={(e) => e.stopPropagation()} href={`/projects/${r.saved_record_id}`} className="ml-1 text-xs text-navy-600 underline">open</Link>}</td>
                </tr>); })}
            </tbody>
          </table>
          {results.length === 0 && <div className="p-8 text-center text-sm text-slate-500">{job.status === "running" ? "Researching… results will appear here as sources are processed." : "No results in this view."}</div>}
        </div>
      </div>
      {open && <ResultDrawer r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ResultDrawer({ r, onClose }: { r: Result; onClose: () => void }) {
  const p = r.payload;
  const skip = new Set(["client_contact", "contacts", "grounding_notes", "snippet", "evidence_quote", "search_provider", "sources", "hunter_verification"]);
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-white p-5 shadow-2xl">
      <div className="mb-3 flex items-start gap-2"><h3 className="flex-1 text-base font-semibold text-navy-900">{r.title}</h3><button className="btn-ghost btn-xs" onClick={onClose}><X className="h-4 w-4" /></button></div>
      {r.opportunity_class && <Badge tone={r.opportunity_class}>{label(OPPORTUNITY_CLASSES, r.opportunity_class)}</Badge>}
      {p.evidence_quote && <blockquote className="mt-3 border-l-4 border-navy-300 bg-navy-50/50 p-2 text-sm italic text-slate-700">“{p.evidence_quote}”</blockquote>}
      <div className="mt-2 text-xs">Source: <a href={r.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-navy-600 underline">{r.source_title || r.source_url}<Ext className="ml-1 inline h-3 w-3" /></a></div>
      {r.duplicate_reason && <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">Duplicate: {r.duplicate_reason}{r.duplicate_of && r.result_type === "project" && <Link className="ml-1 underline" href={`/projects/${r.duplicate_of}`}>open existing</Link>}</div>}
      {p.grounding_notes?.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><div className="font-semibold">Anti-fabrication checks</div><ul className="ml-4 list-disc">{p.grounding_notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>}
      <dl className="kv mt-4 grid grid-cols-2 gap-x-4">{Object.entries(p).filter(([k, v]) => !skip.has(k) && v !== null && v !== "" && v !== "unknown" && typeof v !== "object").map(([k, v]) => <div key={k}><dt>{human(k)}</dt><dd>{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd></div>)}</dl>
      {p.client_contact && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="label">Company contact (from its website)</div>{p.client_contact.emails?.map((e: string) => <div key={e}><a className="text-navy-600 underline" href={`mailto:${e}`}>{e}</a></div>)}{p.client_contact.phones?.map((x: string) => <div key={x}><a className="text-navy-600 underline" href={`tel:${x.replace(/\s/g, "")}`}>{x}</a></div>)}{p.client_contact.sourceUrl && <div className="mt-1 text-xs">Found on: <ExternalLink href={p.client_contact.sourceUrl} /></div>}</div>}
      {p.contacts?.length > 0 && <div className="mt-3"><div className="label">Contacts named in source</div>{p.contacts.map((c: Record<string, string>, i: number) => <div key={i} className="text-sm">{c.name} — {c.designation ?? "role not stated"} {c.email && <span className="text-slate-500">· {c.email}</span>}</div>)}</div>}
      {p.sources?.length > 0 && <div className="mt-3 text-xs"><div className="label">Public sources</div>{p.sources.map((s: string) => <div key={s}><ExternalLink href={s} /></div>)}</div>}
      {p.snippet && <div className="mt-3 text-xs text-slate-500"><div className="label">Search snippet</div>{p.snippet}</div>}
    </div>
  );
}

function HistoryList({ onOpen, active }: { onOpen: (id: string) => void; active?: string | null }) {
  const { data, reload } = useFetch<{ rows: Job[] }>("/api/r/discovery_jobs?pageSize=50&sort=created_at");
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, []);
  return (
    <div className="card">
      <div className="card-h"><span className="card-t flex items-center gap-1.5"><History className="h-4 w-4" />Discovery history</span></div>
      <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
        {(data?.rows ?? []).length === 0 && <li className="p-4 text-center text-sm text-slate-400">No searches yet</li>}
        {(data?.rows ?? []).map((j) => (
          <li key={j.id}><button className={cn("w-full px-4 py-2 text-left hover:bg-slate-50", active === j.id && "bg-navy-50")} onClick={() => onOpen(j.id)}>
            <div className="flex items-center gap-2"><span className="flex-1 truncate text-sm font-medium">{j.title}</span><Badge tone={j.status}>{human(j.status)}</Badge></div>
            <div className="text-xs text-slate-500">{fmtDate(j.created_at, true)} · {j.stats.projects_identified ?? 0} found · {j.stats.awaiting_review ?? 0} to review</div>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

function DiscoveryInner() {
  const sp = useSearchParams(); const router = useRouter();
  const job = sp.get("job"); const [tab, setTab] = useState(job ? "job" : "new");
  useEffect(() => { if (job) setTab("job"); }, [job]);
  const openJob = (id: string) => { router.push(`/discovery?job=${id}`); setTab("job"); };
  return (
    <div>
      <PageHeader title="AI Lead Discovery" subtitle="Real web research across search providers, company sites, news, and tender portals — every result is source-linked and reviewed before saving." />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: "new", label: "New research" }, ...(job ? [{ id: "job", label: "Current job" }] : [])]} />
          {tab === "new" ? <Panel onStarted={openJob} /> : job ? <JobView key={job} id={job} /> : null}
        </div>
        <HistoryList onOpen={openJob} active={job} />
      </div>
    </div>
  );
}
export default function DiscoveryPage() { return <Suspense><DiscoveryInner /></Suspense>; }
