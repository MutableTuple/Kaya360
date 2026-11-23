"use client";
import { useState } from "react";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { useFetch, PageHeader, Spinner, ErrorBox, fmtDate, Badge, human, Stat, inr } from "@/components/ui";
import { ChartCard, Bars, GroupedBars } from "@/components/Charts";
import { STATES } from "@/lib/geo";
import { PIPELINE_STAGES } from "@/lib/constants";
import { useMe, isManager } from "@/components/me";

type R = Record<string, any>;
const EXPORTS: [string, string, string[]][] = [
  ["leads", "Master lead database", ["xlsx", "csv", "pdf"]], ["companies", "Company database", ["xlsx", "csv"]], ["contacts", "Decision-maker database", ["xlsx", "csv"]],
  ["pipeline", "Project pipeline (sheet per stage)", ["xlsx"]], ["tenders", "Tender tracker", ["xlsx", "pdf"]], ["follow_ups", "Follow-up report", ["xlsx", "pdf"]], ["projects", "Projects", ["xlsx", "csv", "pdf"]],
];

export default function ReportsPage() {
  const { me } = useMe();
  const { data, error, loading } = useFetch<{ stats: Record<string, number>; charts: R }>("/api/dashboard?demo=0");
  const { data: runs } = useFetch<{ rows: R[] }>(isManager(me) ? "/api/r/integration_usage?pageSize=1" : null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [state, setState] = useState(""); const [stage, setStage] = useState(""); const [priority, setPriority] = useState(""); const [demo, setDemo] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const qs = (type: string) => { const s = new URLSearchParams(); if (from) s.set("from", from); if (to) s.set("to", to); if (state && ["leads", "pipeline", "projects", "companies", "tenders"].includes(type)) s.set("f_state", state); if (stage && ["leads", "pipeline"].includes(type)) s.set("f_stage", stage); if (priority && ["leads", "pipeline"].includes(type)) s.set("f_priority", priority); if (!demo && ["leads", "pipeline", "projects", "companies", "contacts", "tenders"].includes(type)) s.set("f_no_demo", "1"); return s.toString(); };
  void runs;
  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Branded Excel, CSV and PDF exports from live records, plus performance analysis (DEMO data excluded from analytics)." />
      <div className="card mb-4 p-4">
        <div className="card-t mb-3">Export centre</div>
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-6">
          <div><label className="label">From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><label className="label">State</label><select className="input" value={state} onChange={(e) => setState(e.target.value)}><option value="">All</option>{STATES.map((s) => <option key={s.name}>{s.name}</option>)}</select></div>
          <div><label className="label">Lead status</label><select className="input" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All</option>{PIPELINE_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label">Priority</label><select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="potential">Potential</option><option value="low">Low</option></select></div>
          <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />Include DEMO</label>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {EXPORTS.map(([t, l, fmts]) => <div key={t} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"><span className="text-sm font-medium">{l}</span><span className="flex gap-1">{fmts.map((f) => <a key={f} className="btn-secondary btn-xs" href={`/api/export?type=${t}&format=${f}&${qs(t)}`}>{f === "xlsx" ? <FileSpreadsheet className="h-3.5 w-3.5" /> : f === "pdf" ? <FileText className="h-3.5 w-3.5" /> : <FileDown className="h-3.5 w-3.5" />}{f.toUpperCase()}</a>)}</span></div>)}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <div><label className="label">Monthly BD report</label><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <a className="btn-primary" href={`/api/export/report?kind=monthly&month=${month}`}><FileText className="h-4 w-4" />Monthly report (PDF)</a>
          <a className="btn-secondary" href="/api/export/report?kind=hot">Hot lead report (PDF)</a>
          <a className="btn-secondary" href={`/api/export/report?kind=opportunity&${qs("projects")}`}>Project opportunity report (PDF)</a>
        </div>
      </div>
      {error ? <ErrorBox error={error} /> : loading || !data ? <div className="flex h-40 items-center justify-center"><Spinner /></div> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Leads (excl. demo)" value={data.stats.total_leads} /><Stat label="Quotations" value={data.stats.quotations_submitted} /><Stat label="Awarded" value={data.stats.projects_awarded} />
            <Stat label="Win rate" value={`${data.charts.quote_vs_award.quoted ? Math.round((data.charts.quote_vs_award.awarded / data.charts.quote_vs_award.quoted) * 100) : 0}%`} hint="awarded ÷ quoted" /><Stat label="Awarded value" value={inr(data.stats.awarded_value)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Best-performing cities (leads)" rows={data.charts.by_city} cols={[["name", "City"], ["count", "Leads"]]}><Bars data={data.charts.by_city} x="name" y="count" horizontal /></ChartCard>
            <ChartCard title="Employee performance" rows={data.charts.employee_performance} cols={[["name", "Employee"], ["leads", "Leads"], ["hot", "Hot"], ["quoted", "Quoted"], ["awarded", "Awarded"]]}><GroupedBars data={data.charts.employee_performance} x="name" series={[{ key: "leads", name: "Leads" }, { key: "quoted", name: "Quoted" }, { key: "awarded", name: "Awarded" }]} /></ChartCard>
          </div>
        </>
      )}
      {isManager(me) && <JobRuns />}
      <Badge className="hidden">x</Badge><span className="hidden">{fmtDate(null)}{human(null)}</span>
    </div>
  );
}

function JobRuns() {
  const { data } = useFetch<{ rows: R[] }>("/api/automation/runs");
  if (!data) return null;
  return <div className="card mt-4"><div className="card-h"><span className="card-t">Scheduled automation runs & generated reports</span></div><table className="tbl"><thead><tr><th>When</th><th>Schedule</th><th>Status</th><th>Summary</th></tr></thead><tbody>{data.rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fmtDate(r.started_at, true)}</td><td>{r.frequency}</td><td><Badge tone={r.status}>{r.status}</Badge></td><td className="max-w-xl"><pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">{JSON.stringify(r.summary, null, 1)}</pre></td></tr>)}</tbody></table>{data.rows.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No scheduled runs yet. Configure CRON_SECRET and the schedule (see docs/DEPLOYMENT.md).</div>}</div>;
}
