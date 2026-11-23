"use client";
import Link from "next/link";
import { useState } from "react";
import { FolderKanban, Database, Flame, ShieldCheck, Sparkles, Briefcase, FileText, Award, TrendingUp, Clock, Inbox, Target } from "lucide-react";
import { useFetch, PageHeader, Stat, Spinner, ErrorBox, ScorePill, Badge, fmtDate, inr, human, DemoBadge } from "@/components/ui";
import { ChartCard, Bars, Lines, GroupedBars } from "@/components/Charts";
import { STAGE_LABEL } from "@/lib/constants";

type D = { stats: Record<string, number>; charts: Record<string, any>; widgets: Record<string, any[]> };

export default function Dashboard() {
  const [demo, setDemo] = useState(true);
  const { data, error, loading, reload } = useFetch<D>(`/api/dashboard?demo=${demo ? 1 : 0}`, [demo]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6 text-navy-600" /></div>;
  const s = data!.stats; const c = data!.charts; const w = data!.widgets;
  const funnel = ["newly_discovered", "decision_maker_identified", "contact_verified", "intro_email_sent", "meeting_scheduled", "boq_rfq_received", "quotation_submitted", "commercial_negotiation", "project_awarded"]
    .map((k) => ({ name: STAGE_LABEL[k], count: (c.by_pipeline_stage as { name: string; count: number }[]).filter((x) => x.name === k).reduce((a, b) => a + b.count, 0) }));
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="All figures are calculated live from database records." actions={<>
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />Include DEMO data</label>
        <Link href="/discovery" className="btn-primary"><Sparkles className="h-4 w-4" />Discover new projects</Link></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Total projects" value={s.total_projects} icon={<FolderKanban className="h-4 w-4" />} />
        <Stat label="Total leads" value={s.total_leads} icon={<Database className="h-4 w-4" />} />
        <Stat label="Hot leads" value={s.hot_leads} icon={<Flame className="h-4 w-4" />} tone="bg-red-50 text-red-700" />
        <Stat label="Warm leads" value={s.warm_leads} icon={<TrendingUp className="h-4 w-4" />} tone="bg-amber-50 text-amber-700" />
        <Stat label="Verified contacts" value={s.verified_contacts} icon={<ShieldCheck className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-700" />
        <Stat label="Discovered this month" value={s.projects_this_month} icon={<Sparkles className="h-4 w-4" />} />
        <Stat label="Active enquiries" value={s.active_enquiries} icon={<Briefcase className="h-4 w-4" />} />
        <Stat label="RFQs received" value={s.rfqs_received} icon={<Inbox className="h-4 w-4" />} />
        <Stat label="Quotations submitted" value={s.quotations_submitted} icon={<FileText className="h-4 w-4" />} />
        <Stat label="Projects awarded" value={s.projects_awarded} icon={<Award className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-700" />
        <Stat label="Lost opportunities" value={s.lost} icon={<Target className="h-4 w-4" />} tone="bg-slate-100 text-slate-600" />
        <Stat label="Open pipeline value" value={inr(s.pipeline_value)} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Monthly lead discovery" rows={c.monthly_discovery} cols={[["month", "Month"], ["count", "Leads"]]}><Lines data={c.monthly_discovery} x="month" series={[{ key: "count", name: "Leads" }]} /></ChartCard>
        <ChartCard title="Leads by state" rows={c.by_state} cols={[["name", "State"], ["count", "Leads"]]}><Bars data={c.by_state.slice(0, 10)} x="name" y="count" horizontal /></ChartCard>
        <ChartCard title="Leads by city (top 15)" rows={c.by_city} cols={[["name", "City"], ["count", "Leads"]]}><Bars data={c.by_city} x="name" y="count" horizontal /></ChartCard>
        <ChartCard title="Leads by project category" rows={c.by_category} cols={[["name", "Category"], ["count", "Leads"]]}><Bars data={c.by_category.slice(0, 10)} x="name" y="count" horizontal /></ChartCard>
        <ChartCard title="Leads by project stage" rows={c.by_project_stage} cols={[["name", "Stage"], ["count", "Leads"]]}><Bars data={c.by_project_stage.map((x: { name: string; count: number }) => ({ ...x, name: human(x.name) }))} x="name" y="count" /></ChartCard>
        <ChartCard title="Contact verification status" rows={c.verification} cols={[["name", "Status"], ["count", "Contacts"]]}><Bars data={c.verification.map((x: { name: string; count: number }) => ({ ...x, name: human(x.name) }))} x="name" y="count" /></ChartCard>
        <ChartCard title="Lead conversion funnel" rows={funnel} cols={[["name", "Stage"], ["count", "Leads"]]}><Bars data={funnel} x="name" y="count" horizontal /></ChartCard>
        <ChartCard title="Monthly enquiry value" rows={c.monthly_enquiry_value} cols={[["month", "Month"], ["value", "Value (₹)"]]}><Bars data={c.monthly_enquiry_value} x="month" y="value" fmt={(v) => inr(v)} /></ChartCard>
        <ChartCard title={`Quotation vs award (${c.quote_vs_award.quoted ? Math.round((c.quote_vs_award.awarded / c.quote_vs_award.quoted) * 100) : 0}% win rate)`} rows={c.quote_vs_award.quoted ? [{ name: "Quoted", count: c.quote_vs_award.quoted }, { name: "Awarded", count: c.quote_vs_award.awarded }] : []} cols={[["name", ""], ["count", "Leads"]]}>
          <Bars data={[{ name: "Quoted", count: c.quote_vs_award.quoted }, { name: "Awarded", count: c.quote_vs_award.awarded }]} x="name" y="count" />
        </ChartCard>
      </div>
      <div className="mt-4"><ChartCard title="Employee performance" rows={c.employee_performance} cols={[["name", "Employee"], ["leads", "Leads"], ["hot", "Hot"], ["quoted", "Quoted"], ["awarded", "Awarded"]]}><GroupedBars data={c.employee_performance} x="name" series={[{ key: "leads", name: "Leads" }, { key: "hot", name: "Hot" }, { key: "quoted", name: "Quoted" }, { key: "awarded", name: "Awarded" }]} /></ChartCard></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Widget title="Latest discovered projects" href="/projects" rows={w.latest} render={(r) => <Link href={`/projects/${r.id}`} className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{r.name} <DemoBadge show={r.is_demo} /></span><span className="text-xs text-slate-500">{[r.client_name, r.city].filter(Boolean).join(" · ")}</span></span><Badge tone={r.opportunity_class}>{human(r.opportunity_class?.split("_")[0])}</Badge></Link>} />
        <Widget title="Hot leads" href="/hot-leads" rows={w.hot} render={(r) => <Link href={`/leads/${r.id}`} className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{r.project_name ?? r.lead_code}</span><span className="text-xs text-slate-500">{[r.company_name, r.city, STAGE_LABEL[r.stage]].filter(Boolean).join(" · ")}</span></span><ScorePill score={r.score} /></Link>} />
        <Widget title="Upcoming follow-ups" href="/calendar" rows={w.upcoming} render={(r) => <FU r={r} />} />
        <Widget title="Overdue activities" href="/calendar" rows={w.overdue} render={(r) => <FU r={r} overdue />} />
        <Widget title="Recent contact discoveries" href="/contacts" rows={w.contacts} render={(r) => <div className="flex justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{r.full_name}</span><span className="text-xs text-slate-500">{[r.designation, r.company_name].filter(Boolean).join(" · ")}</span></span><Badge tone={r.email_verification_status}>{human(r.email_verification_status)}</Badge></div>} />
        <Widget title="Tender deadlines" href="/tenders" rows={w.tenders} render={(r) => <div className="flex justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-xs text-slate-500">{r.organisation}</span></span><span className="whitespace-nowrap text-xs text-red-700"><Clock className="mr-1 inline h-3 w-3" />{fmtDate(r.submission_deadline)}</span></div>} />
        <Widget title="Recent company activity" href="/companies" rows={w.companies} render={(r) => <Link href={`/companies/${r.id}`} className="flex justify-between gap-2"><span className="truncate font-medium">{r.name}</span><span className="text-xs text-slate-500">{fmtDate(r.updated_at)}</span></Link>} />
      </div>
    </div>
  );
}

function FU({ r, overdue }: { r: Record<string, string>; overdue?: boolean }) {
  return <Link href={r.lead_id ? `/leads/${r.lead_id}` : "/calendar"} className="flex justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-xs text-slate-500">{[human(r.activity_type), r.company_name, r.assigned_name].filter(Boolean).join(" · ")}</span></span><span className={overdue ? "whitespace-nowrap text-xs font-medium text-red-700" : "whitespace-nowrap text-xs text-slate-600"}>{fmtDate(r.due_at, true)}</span></Link>;
}

function Widget({ title, href, rows, render }: { title: string; href: string; rows: any[]; render: (r: any) => React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-h"><span className="card-t">{title}</span><Link href={href} className="text-xs text-navy-600 hover:underline">View all</Link></div>
      <ul className="divide-y divide-slate-100">{rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-slate-400">Nothing here yet</li> : rows.map((r) => <li key={r.id} className="px-4 py-2 text-sm">{render(r)}</li>)}</ul>
    </div>
  );
}
