"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Filter, Download, X } from "lucide-react";
import { api, cn, Empty, ErrorBox, Spinner, ApiError } from "./ui";

export interface Column<T = Record<string, unknown>> { key: string; header: string; render?: (row: T) => ReactNode; sortable?: boolean; className?: string; hidden?: boolean }
export interface FilterDef { key: string; label: string; type: "select" | "multiselect" | "text" | "number" | "date" | "bool"; options?: readonly (readonly [string, string])[] }

interface Props<T> {
  resource: string; columns: Column<T>[]; filters?: FilterDef[]; fixedFilters?: Record<string, string>; defaultSort?: string; defaultDir?: "asc" | "desc";
  onRowClick?: (row: T) => void; selectable?: boolean; bulkActions?: (selected: string[], clear: () => void, reload: () => void) => ReactNode;
  toolbar?: ReactNode; reloadKey?: number; exportType?: string; pageSize?: number; emptyTitle?: string; emptyHint?: ReactNode; initialFilters?: Record<string, string>;
}

export function DataTable<T extends Record<string, unknown>>(p: Props<T>) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [sort, setSort] = useState(p.defaultSort ?? ""); const [dir, setDir] = useState<"asc" | "desc" | "">(p.defaultDir ?? "");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(p.pageSize ?? 25);
  const [filters, setFilters] = useState<Record<string, string>>(p.initialFilters ?? {}); const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<{ rows: T[]; total: number } | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<ApiError | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [n, setN] = useState(0);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const qs = useMemo(() => {
    const s = new URLSearchParams();
    if (dq) s.set("q", dq); if (sort) s.set("sort", sort); if (dir) s.set("dir", dir);
    s.set("page", String(page)); s.set("pageSize", String(pageSize));
    for (const [k, v] of Object.entries({ ...filters, ...(p.fixedFilters ?? {}) })) if (v) s.set(`f_${k}`, v);
    return s.toString();
  }, [dq, sort, dir, page, pageSize, filters, p.fixedFilters]);
  useEffect(() => {
    let alive = true; setLoading(true);
    api<{ rows: T[]; total: number }>(`/api/r/${p.resource}?${qs}`).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => alive && setError(e)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [qs, n, p.reloadKey, p.resource]);
  const reload = () => setN((x) => x + 1);
  const cols = p.columns.filter((c) => !c.hidden);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const allIds = (data?.rows ?? []).map((r) => String(r.id));
  const exportQs = () => { const s = new URLSearchParams(qs); s.delete("page"); s.delete("pageSize"); return s.toString(); };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <input className="input pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {p.filters?.length ? <button className={cn("btn-secondary", activeFilters.length && "border-navy-400 text-navy-800")} onClick={() => setShowFilters((x) => !x)}><Filter className="h-4 w-4" />Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}</button> : null}
        {p.exportType && (
          <div className="flex gap-1">
            {(["xlsx", "csv", "pdf"] as const).map((f) => <a key={f} className="btn-secondary btn-xs" href={`/api/export?type=${p.exportType}&format=${f}&${exportQs()}`}><Download className="h-3.5 w-3.5" />{f.toUpperCase()}</a>)}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">{p.toolbar}</div>
      </div>
      {showFilters && p.filters && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/60 p-3 md:grid-cols-4 xl:grid-cols-6">
          {p.filters.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.type === "select" || f.type === "bool" ? (
                <select className="input" value={filters[f.key] ?? ""} onChange={(e) => { setFilters({ ...filters, [f.key]: e.target.value }); setPage(1); }}>
                  <option value="">Any</option>
                  {(f.type === "bool" ? ([["true", "Yes"]] as const) : f.options ?? []).map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                </select>
              ) : f.type === "multiselect" ? (
                <select multiple className="input h-20" value={(filters[f.key] ?? "").split("|").filter(Boolean)} onChange={(e) => { setFilters({ ...filters, [f.key]: [...e.target.selectedOptions].map((o) => o.value).join("|") }); setPage(1); }}>
                  {(f.options ?? []).map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                </select>
              ) : (
                <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={filters[f.key] ?? ""} onChange={(e) => { setFilters({ ...filters, [f.key]: e.target.value }); setPage(1); }} />
              )}
            </div>
          ))}
          <div className="flex items-end"><button className="btn-ghost btn-xs" onClick={() => setFilters({})}><X className="h-3.5 w-3.5" />Clear filters</button></div>
        </div>
      )}
      {p.selectable && sel.size > 0 && p.bulkActions && (
        <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-navy-50 px-3 py-2 text-sm">
          <span className="font-medium text-navy-800">{sel.size} selected</span>
          {p.bulkActions([...sel], () => setSel(new Set()), reload)}
          <button className="btn-ghost btn-xs ml-auto" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}
      {error ? <div className="p-3"><ErrorBox error={error} onRetry={reload} /></div> : (
        <div className="relative overflow-x-auto">
          {loading && <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/50 pt-10"><Spinner className="h-5 w-5 text-navy-600" /></div>}
          <table className="tbl">
            <thead><tr>
              {p.selectable && <th className="w-8"><input type="checkbox" aria-label="Select all" checked={allIds.length > 0 && allIds.every((id) => sel.has(id))} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...allIds]) : new Set([...sel].filter((x) => !allIds.includes(x))))} /></th>}
              {cols.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.sortable ? <button className="inline-flex items-center gap-1 uppercase hover:text-navy-800" onClick={() => { if (sort === c.key) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(c.key); setDir("desc"); } }}>{c.header}{sort === c.key && <span>{dir === "asc" ? "▲" : "▼"}</span>}</button> : c.header}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={String(r.id)} className={cn(p.onRowClick && "cursor-pointer")} onClick={() => p.onRowClick?.(r)}>
                  {p.selectable && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={sel.has(String(r.id))} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(String(r.id)); else s.delete(String(r.id)); setSel(s); }} /></td>}
                  {cols.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : (r[c.key] as ReactNode) ?? <span className="text-slate-300">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && data && data.rows.length === 0 && <Empty title={p.emptyTitle ?? "No records found"}>{p.emptyHint ?? (dq || activeFilters.length ? "Try removing search terms or filters." : null)}</Empty>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span>{data ? `${data.total.toLocaleString("en-IN")} record(s)` : " "}</span>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{[25, 50, 100, 250].map((s) => <option key={s} value={s}>{s} / page</option>)}</select>
          <button className="btn-secondary btn-xs" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span>Page {page} of {pages}</span>
          <button className="btn-secondary btn-xs" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
