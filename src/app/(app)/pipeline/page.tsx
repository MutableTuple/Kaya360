"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Download } from "lucide-react";
import { api, PageHeader, ScorePill, inr, fmtDate, useToast, Spinner, ErrorBox, cn, ApiError, DemoBadge } from "@/components/ui";
import { PIPELINE_STAGES } from "@/lib/constants";
import { loadTeam } from "@/components/forms";
import { useMe, canWrite } from "@/components/me";

type L = Record<string, any>;

function Card({ l, disabled }: { l: L; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: l.id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined} className={cn("rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm", !disabled && "cursor-grab active:cursor-grabbing", isDragging && "z-50 opacity-80 shadow-lg")}>
      <div className="flex items-start justify-between gap-2"><Link href={`/leads/${l.id}`} className="font-semibold text-slate-800 hover:underline" onPointerDown={(e) => e.stopPropagation()}>{l.project_name ?? l.title ?? l.lead_code}</Link><ScorePill score={l.score} priority={l.priority} /></div>
      <div className="mt-0.5 text-slate-500">{[l.company_name, l.city].filter(Boolean).join(" · ")} <DemoBadge show={l.is_demo} /></div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
        <span>Value: <b>{inr(l.estimated_value)}</b></span><span className="truncate">Contact: {l.contact_name ?? "—"}</span>
        <span>Last: {fmtDate(l.last_contact_date)}</span><span className={l.next_follow_up && new Date(l.next_follow_up) < new Date() ? "font-semibold text-red-700" : ""}>Next: {fmtDate(l.next_follow_up)}</span>
        <span className="col-span-2 truncate">Owner: {l.assigned_name ?? "Unassigned"}</span>
      </div>
    </div>
  );
}

function Column({ id, title, leads, disabled }: { id: string; title: string; leads: L[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const total = leads.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0);
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-slate-100/70", isOver ? "border-navy-400 bg-navy-50" : "border-slate-200")}>
      <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-semibold text-navy-900">{title}</span><span className="text-[11px] text-slate-500">{leads.length} · {inr(total)}</span></div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100vh - 230px)" }}>{leads.map((l) => <Card key={l.id} l={l} disabled={disabled} />)}</div>
    </div>
  );
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<L[] | null>(null); const [err, setErr] = useState<ApiError | null>(null);
  const [owner, setOwner] = useState(""); const [team, setTeam] = useState<[string, string][]>([]); const [q, setQ] = useState("");
  const toast = useToast(); const { me } = useMe(); const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const load = () => { const s = new URLSearchParams({ pageSize: "500", sort: "score" }); if (owner) s.set("f_assigned", owner); api<{ rows: L[] }>(`/api/r/leads?${s}`).then((d) => setLeads(d.rows)).catch(setErr); };
  useEffect(load, [owner]);
  useEffect(() => { loadTeam().then((t) => setTeam(t.map((u) => [String(u.id), String(u.full_name ?? u.email)]))).catch(() => null); }, []);
  const filtered = useMemo(() => (leads ?? []).filter((l) => !q || `${l.project_name} ${l.company_name} ${l.city}`.toLowerCase().includes(q.toLowerCase())), [leads, q]);
  const onEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id); const to = e.over?.id ? String(e.over.id) : null;
    const l = leads?.find((x) => x.id === id); if (!l || !to || l.stage === to) return;
    const prev = leads!; setLeads(prev.map((x) => (x.id === id ? { ...x, stage: to } : x)));
    try { await api(`/api/leads/${id}/move`, { method: "POST", json: { stage: to } }); toast("success", `Moved to ${PIPELINE_STAGES.find((s) => s[0] === to)?.[1]} — logged in activity history.`); }
    catch (er) { setLeads(prev); toast("error", (er as Error).message); }
  };
  if (err) return <ErrorBox error={err} onRetry={load} />;
  return (
    <div>
      <PageHeader title="Project Pipeline" subtitle="Drag cards between stages. Every move is saved and recorded in the lead's activity history."
        actions={<><input className="input w-48" placeholder="Filter cards…" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input w-48" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All employees</option>{team.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select><a className="btn-secondary" href="/api/export?type=pipeline&format=xlsx"><Download className="h-4 w-4" />Excel</a></>} />
      {!leads ? <div className="flex h-64 items-center justify-center"><Spinner /></div> : (
        <DndContext sensors={sensors} onDragEnd={onEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">{PIPELINE_STAGES.map(([id, t]) => <Column key={id} id={id} title={t} leads={filtered.filter((l) => l.stage === id)} disabled={!canWrite(me)} />)}</div>
        </DndContext>
      )}
      {leads?.length === 500 && <p className="text-xs text-slate-500">Showing the top 500 leads by score. Use the Lead Database for the full list.</p>}
    </div>
  );
}
