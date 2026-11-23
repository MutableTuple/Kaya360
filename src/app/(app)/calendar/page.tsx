"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Copy, Check } from "lucide-react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, format, isSameMonth, isSameDay, isToday } from "date-fns";
import { api, PageHeader, Badge, human, useToast, Spinner, cn, Tabs, fmtDate, Modal } from "@/components/ui";
import { EntityFormModal } from "@/components/forms";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { useMe, canWrite } from "@/components/me";

type F = Record<string, any>;
const TONE: Record<string, string> = { meeting: "bg-sky-100 text-sky-800", site_visit: "bg-emerald-100 text-emerald-800", quotation_submitted: "bg-violet-100 text-violet-800", tender_deadline: "bg-red-100 text-red-800", phone_call: "bg-slate-100 text-slate-700" };

export default function CalendarPage() {
  const [month, setMonth] = useState(startOfMonth(new Date())); const [items, setItems] = useState<F[] | null>(null); const [mine, setMine] = useState(false); const [type, setType] = useState("");
  const [view, setView] = useState("month"); const [add, setAdd] = useState<string | null>(null); const [edit, setEdit] = useState<F | null>(null); const [ics, setIcs] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const { me } = useMe(); const toast = useToast();
  const range = useMemo(() => { const s = view === "month" ? startOfWeek(startOfMonth(month), { weekStartsOn: 1 }) : addDays(new Date(), -60); const e = view === "month" ? endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) : addDays(new Date(), 30); return [s, e]; }, [month, view]);
  const load = () => { const s = new URLSearchParams({ pageSize: "500", sort: "due_at", dir: "asc", f_from: range[0].toISOString(), f_to: range[1].toISOString() }); if (mine && me) s.set("f_assigned", me.id); if (type) s.set("f_type", type); setItems(null); api<{ rows: F[] }>(`/api/r/follow_ups?${s}`).then((d) => setItems(d.rows)).catch((e) => toast("error", e.message)); };
  useEffect(load, [range, mine, type, me?.id]);
  const done = async (f: F) => { try { await api(`/api/r/follow_ups/${f.id}`, { method: "PATCH", json: { status: "done" } }); load(); } catch (e) { toast("error", (e as Error).message); } };
  const now = new Date(); const pending = (items ?? []).filter((f) => f.status === "pending");
  const overdue = pending.filter((f) => new Date(f.due_at) < now); const today = pending.filter((f) => isSameDay(new Date(f.due_at), now) && new Date(f.due_at) >= now);
  const week = pending.filter((f) => new Date(f.due_at) > now && new Date(f.due_at) < addDays(now, 7));
  const days: Date[] = []; for (let d = range[0]; d <= range[1]; d = addDays(d, 1)) days.push(d);
  const Item = ({ f }: { f: F }) => <li className="flex items-center gap-2 px-4 py-2 text-sm"><span className={cn("badge", TONE[f.activity_type] ?? "bg-slate-100")}>{human(f.activity_type)}</span><button className="flex-1 text-left" onClick={() => setEdit(f)}><span className="font-medium">{f.title}</span><span className="block text-xs text-slate-500">{[f.lead_code, f.company_name, f.contact_name, f.assigned_name].filter(Boolean).join(" · ")}</span></button><span className={cn("whitespace-nowrap text-xs", new Date(f.due_at) < now && f.status === "pending" && "font-semibold text-red-700")}>{fmtDate(f.due_at, true)}</span>{canWrite(me) && f.status === "pending" && <button className="btn-secondary btn-xs" onClick={() => done(f)}>Done</button>}</li>;
  return (
    <div>
      <PageHeader title="Follow-up Calendar" subtitle="Calls, emails, WhatsApp, LinkedIn outreach, meetings, site visits, quotation dates and tender deadlines." actions={<>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Only mine</label>
        <select className="input w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">All activity types</option>{ACTIVITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn-secondary" onClick={async () => { try { setIcs((await api<{ url: string }>("/api/calendar/link")).url); } catch (e) { toast("error", (e as Error).message); } }}>Calendar sync</button>
        {canWrite(me) && <button className="btn-primary" onClick={() => setAdd(new Date(Date.now() + 86400000).toISOString())}><Plus className="h-4 w-4" />New activity</button>}</>} />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[["Overdue", overdue, "text-red-700"], ["Today", today, "text-navy-800"], ["Next 7 days", week, "text-slate-700"]].map(([t, list, c]) => <div key={t as string} className="card"><div className="card-h"><span className={cn("card-t", c as string)}>{t as string} ({(list as F[]).length})</span></div><ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">{(list as F[]).length === 0 ? <li className="p-3 text-center text-xs text-slate-400">Nothing</li> : (list as F[]).slice(0, 20).map((f) => <Item key={f.id} f={f} />)}</ul></div>)}
      </div>
      <Tabs value={view} onChange={setView} tabs={[{ id: "month", label: "Month" }, { id: "list", label: "List" }]} />
      {view === "month" ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b p-3"><button className="btn-ghost btn-xs" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button><span className="font-semibold text-navy-900">{format(month, "MMMM yyyy")}</span><button className="btn-ghost btn-xs" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-[11px] font-semibold uppercase text-slate-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
          {!items ? <div className="flex h-64 items-center justify-center"><Spinner /></div> : (
            <div className="grid grid-cols-7">{days.map((d) => { const list = items.filter((f) => isSameDay(new Date(f.due_at), d)); return (
              <div key={d.toISOString()} className={cn("min-h-[104px] border-b border-r border-slate-100 p-1", !isSameMonth(d, month) && "bg-slate-50/60")} onDoubleClick={() => canWrite(me) && setAdd(new Date(d.setHours(10, 0, 0, 0)).toISOString())}>
                <div className={cn("mb-0.5 text-right text-xs", isToday(d) ? "font-bold text-navy-700" : "text-slate-400")}>{format(d, "d")}</div>
                {list.slice(0, 4).map((f) => <button key={f.id} onClick={() => setEdit(f)} className={cn("mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px]", f.status === "done" ? "bg-slate-100 text-slate-400 line-through" : TONE[f.activity_type] ?? "bg-navy-50 text-navy-800", f.status === "pending" && new Date(f.due_at) < now && "ring-1 ring-red-400")}>{format(new Date(f.due_at), "HH:mm")} {f.title}</button>)}
                {list.length > 4 && <div className="text-[10px] text-slate-500">+{list.length - 4} more</div>}
              </div>); })}</div>)}
        </div>
      ) : <div className="card"><ul className="divide-y divide-slate-100">{(items ?? []).map((f) => <Item key={f.id} f={f} />)}</ul>{items?.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No activities</div>}</div>}
      <p className="mt-2 text-xs text-slate-500">Double-click a day to add an activity. <Link className="underline" href="/api/export?type=follow_ups&format=xlsx">Export follow-up report</Link></p>
      {add && <EntityFormModal open title="New activity" resource="follow_ups" defaults={{ due_at: add, assigned_to: me?.id }} onClose={() => setAdd(null)} onSaved={load} />}
      {edit && <EntityFormModal open title="Edit activity" resource="follow_ups" initial={edit} onClose={() => setEdit(null)} onSaved={load} />}
      <Modal open={!!ics} onClose={() => setIcs(null)} title="Subscribe in Google Calendar / Outlook">
        <p className="text-sm text-slate-600">Add this private URL as a calendar subscription (“From URL” in Google Calendar, “Subscribe from web” in Outlook). It lists your assigned follow-ups and refreshes automatically. Keep it private.</p>
        <div className="mt-3 flex gap-2"><input className="input font-mono text-xs" readOnly value={ics ?? ""} /><button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(ics ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
      </Modal>
      <Badge className="hidden">x</Badge>
    </div>
  );
}
