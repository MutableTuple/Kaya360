"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { api, PageHeader, Spinner, ErrorBox, ApiError } from "@/components/ui";
import { PROJECT_CATEGORIES, PROJECT_STAGES } from "@/lib/constants";
import { STATES, cityCoords } from "@/lib/geo";
import type { Marker } from "@/components/MapView";
import { SERIES } from "@/components/Charts";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="flex h-[520px] items-center justify-center"><Spinner /></div> });
type R = Record<string, any>;
const CATS: Record<string, { label: string; color: string }> = {
  hot: { label: "Hot leads", color: "#e34948" }, warm: { label: "Warm leads", color: SERIES[3] }, potential: { label: "Potential leads", color: SERIES[0] },
  tender: { label: "Tender opportunities", color: SERIES[6] }, enquiry: { label: "Active enquiries", color: SERIES[2] }, awarded: { label: "Awarded projects", color: SERIES[5] }, other: { label: "Other / low", color: "#898781" },
};
const ENQ = ["meeting_scheduled", "site_visit_scheduled", "boq_rfq_received", "quotation_submitted", "technical_discussion", "commercial_negotiation"];

function Inner() {
  const sp = useSearchParams();
  const [projects, setProjects] = useState<R[] | null>(null); const [tenders, setTenders] = useState<R[]>([]); const [err, setErr] = useState<ApiError | null>(null);
  const [f, setF] = useState({ state: "", city: "", category: "", stage: "", priority: "", minValue: "" }); const [show, setShow] = useState<string[]>(Object.keys(CATS));
  useEffect(() => { Promise.all([api<{ rows: R[] }>("/api/r/projects?pageSize=500"), api<{ rows: R[] }>("/api/r/tenders?pageSize=500&f_status=active|closing_soon|upcoming")]).then(([p, t]) => { setProjects(p.rows); setTenders(t.rows); }).catch(setErr); }, []);
  const markers = useMemo(() => {
    const out: (Marker & { cat: string; city: string })[] = [];
    for (const p of projects ?? []) {
      if (f.state && p.state !== f.state) continue; if (f.city && !String(p.city ?? "").toLowerCase().includes(f.city.toLowerCase())) continue;
      if (f.category && p.category !== f.category) continue; if (f.stage && p.current_stage !== f.stage) continue; if (f.priority && p.lead_priority !== f.priority) continue;
      if (f.minValue && Number(p.estimated_project_value ?? 0) < Number(f.minValue) * 1e7) continue;
      const cat = p.lead_stage === "project_awarded" ? "awarded" : ENQ.includes(p.lead_stage) ? "enquiry" : ["hot", "warm", "potential"].includes(p.lead_priority) ? p.lead_priority : "other";
      const exact = p.latitude != null && p.longitude != null; const c = exact ? [p.latitude, p.longitude] : cityCoords(p.city);
      if (!c) continue;
      const jitter = exact ? 0 : ((parseInt(String(p.id).slice(0, 4), 16) % 100) - 50) / 2500;
      out.push({ id: p.id, lat: c[0] + jitter, lng: c[1] + jitter, approx: !exact, color: CATS[cat].color, title: p.name, sub: [p.client_name, p.city, p.lead_score != null ? `Score ${p.lead_score}` : null].filter(Boolean).join(" · "), href: `/projects/${p.id}`, kind: "project", cat, city: p.city ?? "Unknown" });
    }
    for (const t of tenders) {
      if (f.state && t.state !== f.state) continue; const c = cityCoords(t.city); if (!c) continue;
      out.push({ id: t.id, lat: c[0] + 0.01, lng: c[1] + 0.01, approx: true, color: CATS.tender.color, title: t.title, sub: `${t.organisation} · closes ${t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString("en-IN") : "—"}`, href: `/tenders?open=${t.id}`, kind: "tender", cat: "tender", city: t.city ?? "Unknown" });
    }
    return out.filter((m) => show.includes(m.cat));
  }, [projects, tenders, f, show]);
  const unplaced = (projects ?? []).filter((p) => p.latitude == null && !cityCoords(p.city)).length;
  const byCity = useMemo(() => { const m = new Map<string, number>(); for (const x of markers) m.set(x.city, (m.get(x.city) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [markers]);
  const byState = useMemo(() => { const m = new Map<string, number>(); for (const p of projects ?? []) m.set(p.state ?? "Unknown", (m.get(p.state ?? "Unknown") ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [projects]);
  if (err) return <ErrorBox error={err} />;
  return (
    <div>
      <PageHeader title="India Opportunity Map" subtitle="Solid markers are geocoded addresses; faded dashed markers are placed at the city centre because no reliable coordinates exist yet." />
      <div className="card mb-3 grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
        <select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">All states</option>{STATES.map((s) => <option key={s.name}>{s.name}</option>)}</select>
        <input className="input" placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All categories</option>{PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">All stages</option>{PROJECT_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="potential">Potential</option><option value="low">Low</option></select>
        <input className="input" type="number" placeholder="Min value (₹ Cr)" value={f.minValue} onChange={(e) => setF({ ...f, minValue: e.target.value })} />
        <div className="col-span-full flex flex-wrap gap-3 pt-1">{Object.entries(CATS).map(([k, v]) => <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={show.includes(k)} onChange={(e) => setShow(e.target.checked ? [...show, k] : show.filter((x) => x !== k))} /><span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: v.color }} />{v.label}</label>)}</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="card h-[600px] p-1">{projects ? <MapView markers={markers} focus={sp.get("focus")} /> : <div className="flex h-full items-center justify-center"><Spinner /></div>}</div>
        <div className="space-y-4">
          <div className="card"><div className="card-h"><span className="card-t">City-wise distribution</span><span className="text-xs text-slate-500">{markers.length} on map</span></div><ul className="max-h-64 overflow-y-auto text-sm">{byCity.map(([c, n]) => <li key={c} className="flex justify-between border-b border-slate-50 px-4 py-1.5"><span>{c}</span><span className="tabular-nums font-medium">{n}</span></li>)}</ul></div>
          <div className="card"><div className="card-h"><span className="card-t">State-wise projects</span></div><ul className="max-h-64 overflow-y-auto text-sm">{byState.map(([c, n]) => <li key={c} className="flex justify-between border-b border-slate-50 px-4 py-1.5"><span>{c}</span><span className="tabular-nums font-medium">{n}</span></li>)}</ul></div>
          {unplaced > 0 && <p className="text-xs text-slate-500">{unplaced} project(s) have neither coordinates nor a recognised city and are not shown. Open a project and use “Locate on map”.</p>}
        </div>
      </div>
    </div>
  );
}
export default function MapPage() { return <Suspense><Inner /></Suspense>; }
