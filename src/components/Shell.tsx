"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Sparkles, FolderKanban, Database, Building2, Users, Flame, Columns3, Map, FileText, CalendarDays, Mail, ChartColumn, UsersRound, Settings, Search, Bell, Plus, CircleHelp, LogOut, ChevronLeft, Menu, Bot } from "lucide-react";
import { api, cn, Modal, useFetch, fmtDate } from "./ui";
import { MeCtx, type Me } from "./me";
import { EntityFormModal } from "./forms";
import { Assistant } from "./Assistant";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { ROLE_LABELS } from "@/lib/constants";

const NAV = [
  ["/", "Dashboard", LayoutDashboard], ["/discovery", "AI Lead Discovery", Sparkles], ["/projects", "All Projects", FolderKanban], ["/leads", "Lead Database", Database],
  ["/companies", "Companies", Building2], ["/contacts", "Decision Makers", Users], ["/hot-leads", "Hot Leads", Flame], ["/pipeline", "Project Pipeline", Columns3],
  ["/map", "India Opportunity Map", Map], ["/tenders", "Tenders & RFQs", FileText], ["/calendar", "Follow-up Calendar", CalendarDays], ["/email", "Email Centre", Mail],
  ["/reports", "Reports & Analytics", ChartColumn], ["/team", "Team Management", UsersRound], ["/settings", "Settings", Settings],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false);
  const { data, reload } = useFetch<{ settings: Record<string, unknown>; profile: Me }>("/api/settings");
  const [quick, setQuick] = useState<string | null>(null); const [qaOpen, setQaOpen] = useState(false);
  const [help, setHelp] = useState(false); const [assistant, setAssistant] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("kaya.sidebar") === "1"); } catch { /* storage unavailable */ } }, []);
  useEffect(() => setMobile(false), [path]);
  const toggle = () => { setCollapsed((c) => { try { localStorage.setItem("kaya.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; }); };
  const me = data?.profile ?? null;
  const quickItems: [string, string][] = [["leads", "Lead"], ["projects", "Project"], ["companies", "Company"], ["contacts", "Contact"], ["follow_ups", "Follow-up"], ["tenders", "Tender"]];

  return (
    <MeCtx.Provider value={{ me, settings: data?.settings ?? {}, reload }}>
      <div className="flex min-h-screen">
        <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-950 text-navy-100 transition-all", collapsed ? "w-[68px]" : "w-64", mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
          <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-navy-900">K</div>
            {!collapsed && <div className="leading-tight"><div className="text-sm font-semibold text-white">Kaya PI 360</div><div className="text-[10px] uppercase tracking-wider text-navy-300">Project Intelligence</div></div>}
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map(([href, label, Icon]) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return <Link key={href} href={href} title={label} className={cn("mx-2 my-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium", active ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white")}><Icon className="h-[18px] w-[18px] shrink-0" />{!collapsed && <span className="truncate">{label}</span>}</Link>;
            })}
          </nav>
          <button onClick={toggle} className="hidden items-center gap-2 border-t border-white/10 px-5 py-3 text-xs text-navy-300 hover:text-white lg:flex"><ChevronLeft className={cn("h-4 w-4 transition", collapsed && "rotate-180")} />{!collapsed && "Collapse"}</button>
        </aside>
        {mobile && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMobile(false)} />}
        <div className={cn("flex min-w-0 flex-1 flex-col transition-all", collapsed ? "lg:pl-[68px]" : "lg:pl-64")}>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-5">
            <button className="btn-ghost lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1">
              <div className="relative">
                <button className="btn-primary" onClick={() => setQaOpen((x) => !x)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Quick add</span></button>
                {qaOpen && <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" onMouseLeave={() => setQaOpen(false)}>{quickItems.map(([r, l]) => <button key={r} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-navy-50" onClick={() => { setQuick(r); setQaOpen(false); }}>New {l.toLowerCase()}</button>)}</div>}
              </div>
              <button className="btn-ghost" onClick={() => setAssistant(true)} title="AI BD assistant"><Bot className="h-5 w-5" /></button>
              <Notifications />
              <button className="btn-ghost" onClick={() => setHelp(true)} title="Help"><CircleHelp className="h-5 w-5" /></button>
              <Link className="btn-ghost" href="/settings" title="Settings"><Settings className="h-5 w-5" /></Link>
              <ProfileMenu me={me} onSignOut={async () => { await createBrowserSupabase().auth.signOut(); router.push("/login"); }} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-5">{children}</main>
        </div>
      </div>
      {quick && <EntityFormModal open title={`New ${quickItems.find((q) => q[0] === quick)?.[1].toLowerCase()}`} resource={quick} onClose={() => setQuick(null)} defaults={quick === "follow_ups" ? { due_at: new Date(Date.now() + 86400000).toISOString() } : undefined}
        onSaved={(r) => { const to: Record<string, string> = { leads: `/leads/${r.id}`, projects: `/projects/${r.id}`, companies: `/companies/${r.id}`, contacts: "/contacts", follow_ups: "/calendar", tenders: "/tenders" }; router.push(to[quick]); router.refresh(); }} />}
      <Modal open={help} onClose={() => setHelp(false)} title="How to use Kaya Project Intelligence 360" wide>
        <div className="space-y-3 text-sm text-slate-700">
          <p><b>1. Configure integrations</b> (Settings → Integrations): a web search API and OpenAI are required for discovery. Email sending is turned off; drafts are saved in the database. Nothing is simulated — missing integrations are shown clearly.</p>
          <p><b>2. Discover</b> (AI Lead Discovery): choose geography, categories, stage and period, then <i>Discover new projects</i>. The engine searches, reads public sources and extracts projects. Every result carries its source URL and a classification: Confirmed requirement, Potential opportunity or Unverified announcement.</p>
          <p><b>3. Review & save</b>: tick results and save them. Saving creates the project, client company, stakeholders, contacts found in the source and a scored lead. Duplicates are detected automatically.</p>
          <p><b>4. Find people</b>: on a company, use <i>Find decision makers</i>; on a contact, <i>Find business email</i>, <i>Verify email</i> and <i>Find LinkedIn</i>. Emails are only attached to a person when found in a public source.</p>
          <p><b>5. Work the pipeline</b>: drag cards across stages, set follow-ups, send approved emails from Email Centre, and export Excel/CSV/PDF reports.</p>
          <p><b>Roles</b>: Administrators manage users and settings; BD managers can delete and view audit logs; Sales executives and researchers create and edit; Viewers are read-only.</p>
        </div>
      </Modal>
      <Assistant open={assistant} onClose={() => setAssistant(false)} />
    </MeCtx.Provider>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState(""); const [res, setRes] = useState<{ type: string; title: string; sub: string; href: string }[]>([]); const [open, setOpen] = useState(false);
  const router = useRouter(); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); ref.current?.focus(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  useEffect(() => { if (q.trim().length < 2) { setRes([]); return; } const t = setTimeout(() => api<{ results: typeof res }>(`/api/search?q=${encodeURIComponent(q)}`).then((d) => setRes(d.results)).catch(() => setRes([])), 250); return () => clearTimeout(t); }, [q]);
  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
      <input ref={ref} className="input pl-8" placeholder="Search leads, projects, companies, people, tenders…  (Ctrl K)" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && res.length > 0 && (
        <div className="absolute z-40 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {res.map((r, i) => <button key={i} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-navy-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { router.push(r.href); setOpen(false); setQ(""); }}><span className="mt-0.5 w-16 shrink-0 text-[10px] font-semibold uppercase text-slate-400">{r.type}</span><span className="min-w-0"><span className="block truncate text-sm text-slate-800">{r.title}</span><span className="block truncate text-xs text-slate-500">{r.sub}</span></span></button>)}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useFetch<{ notifications: { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; kind: string }[]; unread: number }>("/api/notifications");
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, []);
  const router = useRouter();
  return (
    <div className="relative">
      <button className="btn-ghost relative" onClick={() => setOpen((x) => !x)} title="Notifications"><Bell className="h-5 w-5" />{!!data?.unread && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{data.unread}</span>}</button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-[360px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2"><span className="text-sm font-semibold">Notifications</span><button className="text-xs text-navy-600 hover:underline" onClick={async () => { await api("/api/notifications", { method: "POST", json: { all: true } }); reload(); }}>Mark all read</button></div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.notifications ?? []).length === 0 && <div className="p-4 text-center text-sm text-slate-500">No notifications</div>}
            {(data?.notifications ?? []).map((n) => (
              <button key={n.id} className={cn("block w-full border-b border-slate-50 px-3 py-2 text-left hover:bg-slate-50", !n.read_at && "bg-navy-50/50")} onClick={async () => { if (!n.read_at) await api("/api/notifications", { method: "POST", json: { ids: [n.id] } }).catch(() => null); setOpen(false); reload(); if (n.link) router.push(n.link); }}>
                <div className="text-sm text-slate-800">{n.title}</div>{n.body && <div className="text-xs text-slate-500">{n.body}</div>}<div className="mt-0.5 text-[10px] text-slate-400">{fmtDate(n.created_at, true)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ me, onSignOut }: { me: Me | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = (me?.full_name ?? me?.email ?? "?").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white" onClick={() => setOpen((x) => !x)} title="Profile">{initials}</button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          <div className="border-b px-3 py-2"><div className="truncate text-sm font-medium">{me?.full_name ?? "—"}</div><div className="truncate text-xs text-slate-500">{me?.email}</div><div className="mt-0.5 text-[11px] text-navy-700">{me ? ROLE_LABELS[me.role] : ""}</div></div>
          <Link href="/team?me=1" className="block px-3 py-1.5 text-sm hover:bg-slate-50">My profile</Link>
          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={onSignOut}><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}
