"use client";
import { Badge, fmtDate, human } from "./ui";
type Any = Record<string, any>;

export function AuditList({ rows }: { rows: Any[] }) {
  return <div className="card"><ul className="divide-y divide-slate-100">{rows.length === 0 && <li className="p-4 text-center text-sm text-slate-400">No audit entries</li>}
    {rows.map((a) => <li key={a.id} className="px-4 py-2 text-sm"><div className="flex justify-between"><span><Badge>{a.action}</Badge> <span className="ml-1 text-slate-700">{a.actor_email ?? "System"}</span></span><span className="text-xs text-slate-400">{fmtDate(a.created_at, true)}</span></div>
      {a.changed_fields?.length > 0 && <div className="mt-1 space-y-0.5 text-xs">{a.changed_fields.slice(0, 12).map((f: string) => <div key={f}><span className="font-medium text-slate-600">{human(f)}:</span> <span className="text-red-700 line-through">{JSON.stringify(a.old_data?.[f] ?? null)?.slice(0, 80)}</span> → <span className="text-emerald-700">{JSON.stringify(a.new_data?.[f] ?? null)?.slice(0, 80)}</span></div>)}</div>}</li>)}</ul></div>;
}
