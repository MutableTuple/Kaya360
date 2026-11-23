"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { X, Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export const cn = clsx;

// ---------------- Toasts ----------------
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn("card flex items-start gap-2 p-3 text-sm", t.kind === "error" && "border-red-200 bg-red-50", t.kind === "success" && "border-emerald-200 bg-emerald-50")}>
            {t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" />}
            <span className="flex-1 whitespace-pre-line">{t.text}</span>
            <button onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss"><X className="h-4 w-4 text-slate-400" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------- API helper ----------------
export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, { ...rest, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : null;
  if (res.status === 401 && typeof window !== "undefined") { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code ?? data?.details?.code);
  return data as T;
}

export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let alive = true; setLoading(true);
    api<T>(url).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => alive && setError(e)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url, n, ...deps]);
  return { data, error, loading, reload: () => setN((x) => x + 1), setData };
}

// ---------------- Primitives ----------------
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />; }

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean | "xl" }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); if (open) window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 pt-[6vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("card w-full", wide === "xl" ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-lg")} role="dialog" aria-modal="true">
        <div className="card-h"><h3 className="card-t text-base">{title}</h3><button className="btn-ghost btn-xs" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel = "Delete", danger = true, onConfirm, onClose, busy }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{confirmLabel}</button></>}>
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}

const TONES: Record<string, string> = {
  hot: "bg-red-100 text-red-700", warm: "bg-amber-100 text-amber-800", potential: "bg-sky-100 text-sky-800", low: "bg-slate-100 text-slate-600",
  verified: "bg-emerald-100 text-emerald-700", invalid: "bg-red-100 text-red-700", catch_all: "bg-amber-100 text-amber-800", unknown: "bg-slate-100 text-slate-600", pending: "bg-violet-100 text-violet-700", not_checked: "bg-slate-100 text-slate-500",
  CONFIRMED_REQUIREMENT: "bg-emerald-100 text-emerald-800", POTENTIAL_OPPORTUNITY: "bg-sky-100 text-sky-800", UNVERIFIED_ANNOUNCEMENT: "bg-slate-100 text-slate-600",
  running: "bg-sky-100 text-sky-800", paused: "bg-amber-100 text-amber-800", completed: "bg-emerald-100 text-emerald-700", failed: "bg-red-100 text-red-700", cancelled: "bg-slate-200 text-slate-600", needs_configuration: "bg-orange-100 text-orange-800", queued: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700", closing_soon: "bg-red-100 text-red-700", upcoming: "bg-sky-100 text-sky-800", closed: "bg-slate-200 text-slate-600",
  draft: "bg-slate-100 text-slate-700", sent: "bg-emerald-100 text-emerald-700", sending: "bg-sky-100 text-sky-700", approved: "bg-sky-100 text-sky-700",
  done: "bg-emerald-100 text-emerald-700", demo: "bg-fuchsia-100 text-fuchsia-700", saved: "bg-emerald-100 text-emerald-700", rejected: "bg-slate-200 text-slate-600", duplicate: "bg-amber-100 text-amber-800",
  partially_verified: "bg-sky-100 text-sky-800", unverified: "bg-slate-100 text-slate-600", outdated: "bg-amber-100 text-amber-800",
  official_company: "bg-emerald-100 text-emerald-700", public_professional: "bg-sky-100 text-sky-800", unavailable: "bg-slate-100 text-slate-500",
};
export function Badge({ tone, children, className }: { tone?: string | null; children: ReactNode; className?: string }) {
  return <span className={cn("badge", TONES[tone ?? ""] ?? "bg-slate-100 text-slate-700", className)}>{children}</span>;
}
export function DemoBadge({ show }: { show?: boolean | null }) { return show ? <Badge tone="demo">DEMO</Badge> : null; }

export function ScorePill({ score, priority }: { score?: number | null; priority?: string | null }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const p = priority ?? (score >= 80 ? "hot" : score >= 60 ? "warm" : score >= 40 ? "potential" : "low");
  return <span className={cn("badge font-semibold tabular-nums", TONES[p])}>{score}</span>;
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">{icon}<div className="text-sm font-semibold text-slate-700">{title}</div>{children && <div className="max-w-md text-sm text-slate-500">{children}</div>}</div>;
}

export function ErrorBox({ error, onRetry }: { error: { message: string; code?: string; status?: number } | null; onRetry?: () => void }) {
  if (!error) return null;
  const cfg = error.code === "missing_configuration" || error.status === 503;
  return (
    <div className={cn("rounded-lg border p-3 text-sm", cfg ? "border-orange-200 bg-orange-50 text-orange-900" : "border-red-200 bg-red-50 text-red-800")}>
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{cfg && <div className="font-semibold">Configuration required</div>}{error.message}{cfg && <div className="mt-1"><a className="underline" href="/settings?tab=integrations">Open Settings → Integrations</a></div>}</div>{onRetry && <button className="btn-secondary btn-xs" onClick={onRetry}>Retry</button>}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight text-navy-900">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => <button key={t.id} onClick={() => onChange(t.id)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", value === t.id ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500 hover:text-slate-800")}>{t.label}</button>)}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string }) {
  return (
    <div className="card flex items-start gap-3 p-3.5">
      {icon && <div className={cn("rounded-lg p-2", tone ?? "bg-navy-50 text-navy-700")}>{icon}</div>}
      <div className="min-w-0"><div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="mt-0.5 text-xl font-semibold tabular-nums text-navy-900">{value}</div>{hint && <div className="text-xs text-slate-500">{hint}</div>}</div>
    </div>
  );
}

export const inr = (v?: number | string | null, compact = true) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (compact) { if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e9 ? 0 : 2)} Cr`; if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; }
  return `₹${n.toLocaleString("en-IN")}`;
};
export const fmtDate = (v?: string | null, time = false) => {
  if (!v) return "—";
  const d = new Date(v); if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
};
export const human = (v?: string | null) => (v ? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export function ExternalLink({ href, children }: { href?: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-slate-400">—</span>;
  let host = href; try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* raw */ }
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-navy-600 hover:underline break-all">{children ?? host}</a>;
}
