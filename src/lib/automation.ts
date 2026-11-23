import "server-only";
import { createAdminClient } from "./supabase/admin";
import { createJob, runJobStep } from "./discovery/engine";
import { recomputeLeadScore } from "./leadService";
import type { DiscoveryParams } from "./discovery/queries";
import type { GeoSelection } from "./geo";

type Freq = "tick" | "daily" | "weekly" | "monthly";
interface AutoSettings {
  enabled: boolean; queries_per_run: number; categories: string[];
  geography: { region: "all" | "west" | "north" | "states" | "cities"; states: string[]; cities: string[] };
  daily: { discover_projects: boolean; discover_tenders: boolean; max_jobs: number };
  weekly: { refresh_hot_leads: boolean; deadline_check: boolean; report: boolean };
  monthly: { performance_report: boolean; inactive_leads: boolean };
  notify_roles: string[];
}

async function notifyRoles(admin: ReturnType<typeof createAdminClient>, roles: string[], n: { kind: string; title: string; body?: string; link?: string; dedupe_key: string }) {
  const { data } = await admin.from("profiles").select("id").in("role", roles).eq("is_active", true);
  if (!data?.length) return;
  for (const u of data) await notify(admin, { user_id: u.id, ...n });
}

/** Insert a notification, ignoring duplicates (unique on user + dedupe_key). */
async function notify(admin: ReturnType<typeof createAdminClient>, n: Record<string, unknown>) {
  const { error } = await admin.from("notifications").insert(n);
  if (error && error.code !== "23505") console.error("[notify]", error.message);
}

export async function runAutomation(freq: Freq) {
  const admin = createAdminClient();
  const { data: run } = await admin.from("scheduled_job_runs").insert({ frequency: freq }).select("id").single();
  const summary: Record<string, unknown> = {};
  try {
    const s = ((await admin.from("application_settings").select("value").eq("key", "automation").maybeSingle()).data?.value ?? {}) as AutoSettings;
    const roles = s.notify_roles?.length ? s.notify_roles : ["administrator", "bd_manager"];

    if (freq === "tick") {
      // 1) keep running discovery jobs moving even when nobody has the page open
      const { data: jobs } = await admin.from("discovery_jobs").select("id").eq("status", "running").order("created_at").limit(2);
      const results = [];
      for (const j of jobs ?? []) results.push(await runJobStep(j.id, 35_000));
      summary.jobs_advanced = results.length;
      // 2) follow-up reminders (due within 1h) and overdue
      const now = new Date(); const soon = new Date(now.getTime() + 3600_000);
      const { data: due } = await admin.from("v_follow_ups").select("id,title,due_at,assigned_to,lead_id").eq("status", "pending").lte("due_at", soon.toISOString()).gte("due_at", new Date(now.getTime() - 7 * 86400000).toISOString()).limit(500);
      let n = 0;
      for (const f of due ?? []) {
        if (!f.assigned_to) continue;
        const overdue = new Date(f.due_at) < now;
        await notify(admin, { user_id: f.assigned_to, kind: overdue ? "follow_up_overdue" : "follow_up_due", title: overdue ? `Overdue: ${f.title}` : `Due soon: ${f.title}`, body: new Date(f.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), link: f.lead_id ? `/leads/${f.lead_id}` : "/calendar", dedupe_key: `fu:${f.id}:${overdue ? "o" : "d"}` });
        n++;
      }
      summary.follow_up_notifications = n;
    }

    if (freq === "daily") {
      // tender deadline alerts (7, 3, 1 days)
      const { data: t } = await admin.from("v_tenders").select("id,title,organisation,submission_deadline").is("deleted_at", null).gte("submission_deadline", new Date().toISOString()).lte("submission_deadline", new Date(Date.now() + 7 * 86400000).toISOString());
      for (const x of t ?? []) {
        const days = Math.ceil((new Date(x.submission_deadline).getTime() - Date.now()) / 86400000);
        const bucket = days <= 1 ? 1 : days <= 3 ? 3 : 7;
        await notifyRoles(admin, [...roles, "sales_executive"], { kind: "tender_deadline", title: `Tender closes in ${days} day(s): ${x.title}`.slice(0, 200), body: x.organisation, link: `/tenders?open=${x.id}`, dedupe_key: `tender:${x.id}:${bucket}` });
      }
      summary.tender_alerts = t?.length ?? 0;

      if (s.enabled) {
        const geo: GeoSelection = s.geography?.region === "states" ? { scope: "states", states: s.geography.states } : s.geography?.region === "cities" ? { scope: "cities", cities: s.geography.cities } : { scope: (s.geography?.region ?? "west") as GeoSelection["scope"] };
        const base: DiscoveryParams = { geography: geo, categories: s.categories ?? [], stages: [], period: "7d", sizes: [], keywords: [], maxQueries: s.queries_per_run ?? 12 };
        const created: string[] = [];
        if (s.daily?.discover_projects) { const r = await createJob(admin, "projects", base, null, "schedule", "Scheduled daily project discovery"); created.push(`${r.job.id}:${r.job.status}`); }
        if (s.daily?.discover_tenders) { const r = await createJob(admin, "tenders", { ...base, categories: [] }, null, "schedule", "Scheduled daily tender discovery"); created.push(`${r.job.id}:${r.job.status}`); }
        // saved searches scheduled daily
        const { data: ss } = await admin.from("saved_searches").select("*").eq("schedule", "daily").limit(Math.max(0, (s.daily?.max_jobs ?? 2) - created.length));
        for (const x of ss ?? []) {
          if (x.kind === "leads") continue;
          const r = await createJob(admin, x.kind, x.params as DiscoveryParams, x.owner_id, "schedule", `Scheduled: ${x.name}`);
          await admin.from("saved_searches").update({ last_run_at: new Date().toISOString() }).eq("id", x.id);
          created.push(`${r.job.id}:${r.job.status}`);
        }
        summary.jobs_created = created;
        if (created.some((c) => c.endsWith("needs_configuration"))) await notifyRoles(admin, ["administrator"], { kind: "integration_error", title: "Scheduled discovery could not run — integrations missing", link: "/settings?tab=integrations", dedupe_key: `cfg:${new Date().toISOString().slice(0, 10)}` });
      } else summary.discovery = "automation disabled in Settings → Automation";
    }

    if (freq === "weekly") {
      if (s.weekly?.refresh_hot_leads !== false) {
        const { data: hot } = await admin.from("leads").select("id").is("deleted_at", null).gte("score", 60).limit(300);
        for (const l of hot ?? []) await recomputeLeadScore(admin, l.id);
        summary.rescored = hot?.length ?? 0;
        // propose decision-maker research for hot leads with no contact (created as jobs when automation is enabled)
        if (s.enabled) {
          const { data: noContact } = await admin.from("v_leads").select("company_id,company_name").is("deleted_at", null).eq("priority", "hot").is("primary_contact_id", null).not("company_id", "is", null).limit(3);
          for (const l of noContact ?? []) {
            const { data: co } = await admin.from("companies").select("domain").eq("id", l.company_id).single();
            await createJob(admin, "decision_makers", { geography: { scope: "all" }, categories: [], stages: [], period: "12m", sizes: [], keywords: [], companyId: l.company_id, companyName: l.company_name, companyDomain: co?.domain ?? undefined, maxQueries: 8 }, null, "schedule");
          }
          summary.dm_jobs = noContact?.length ?? 0;
        }
      }
      if (s.weekly?.report !== false) {
        const stats = await weeklyNumbers(admin);
        summary.report = stats;
        await notifyRoles(admin, roles, { kind: "report", title: `Weekly BD report: ${stats.new_leads} new leads, ${stats.hot} hot, ${stats.quotations} quotations`, body: `Pipeline value ₹${Number(stats.pipeline_value).toLocaleString("en-IN")}`, link: "/reports", dedupe_key: `weekly:${new Date().toISOString().slice(0, 10)}` });
      }
    }

    if (freq === "monthly") {
      const since = new Date(Date.now() - 31 * 86400000).toISOString();
      const { data: leads } = await admin.from("v_leads").select("city,state,stage,score,updated_at,last_contact_date,id,lead_code,assigned_to").is("deleted_at", null).is("archived_at", null).limit(20000);
      const byCity = new Map<string, { leads: number; hot: number; won: number; quoted: number }>();
      for (const l of leads ?? []) {
        const k = l.city ?? "Unknown"; const v = byCity.get(k) ?? { leads: 0, hot: 0, won: 0, quoted: 0 };
        v.leads++; if (l.score >= 80) v.hot++; if (l.stage === "project_awarded") v.won++; if (["quotation_submitted", "technical_discussion", "commercial_negotiation", "project_awarded"].includes(l.stage)) v.quoted++;
        byCity.set(k, v);
      }
      const cities = [...byCity.entries()].map(([city, v]) => ({ city, ...v, conversion: v.quoted ? +(v.won / v.quoted * 100).toFixed(1) : 0 })).sort((a, b) => b.won - a.won || b.hot - a.hot || b.leads - a.leads);
      const inactive = (leads ?? []).filter((l) => !["project_awarded", "lost", "on_hold"].includes(l.stage) && new Date(l.last_contact_date ?? l.updated_at) < new Date(Date.now() - 45 * 86400000));
      const total = leads?.length ?? 0; const quoted = (leads ?? []).filter((l) => ["quotation_submitted", "technical_discussion", "commercial_negotiation", "project_awarded"].includes(l.stage)).length;
      const won = (leads ?? []).filter((l) => l.stage === "project_awarded").length;
      // Suggest markets: priority-region cities with hot leads but low coverage (few contacts researched)
      const suggestions = cities.filter((c) => c.city !== "Unknown" && c.hot >= 1 && c.quoted === 0).slice(0, 5).map((c) => `${c.city}: ${c.hot} hot lead(s), no quotations yet`);
      summary.monthly = { best_cities: cities.slice(0, 10), conversion: { total, quoted, won, quote_rate: total ? +(quoted / total * 100).toFixed(1) : 0, win_rate: quoted ? +(won / quoted * 100).toFixed(1) : 0 }, inactive_leads: inactive.length, suggested_markets: suggestions, since };
      if (s.monthly?.inactive_leads !== false) for (const l of inactive.slice(0, 100)) if (l.assigned_to) await notify(admin, { user_id: l.assigned_to, kind: "follow_up_overdue", title: `Inactive lead ${l.lead_code}: no contact in 45+ days`, link: `/leads/${l.id}`, dedupe_key: `inactive:${l.id}:${new Date().toISOString().slice(0, 7)}` });
      if (s.monthly?.performance_report !== false) await notifyRoles(admin, roles, { kind: "report", title: `Monthly performance: ${won} awarded / ${quoted} quoted`, body: suggestions.length ? `Markets to target: ${suggestions.join("; ")}` : undefined, link: "/reports", dedupe_key: `monthly:${new Date().toISOString().slice(0, 7)}` });
    }

    await admin.from("scheduled_job_runs").update({ status: "completed", summary, finished_at: new Date().toISOString() }).eq("id", run?.id);
    return summary;
  } catch (e) {
    await admin.from("scheduled_job_runs").update({ status: "failed", summary: { ...summary, error: (e as Error).message }, finished_at: new Date().toISOString() }).eq("id", run?.id);
    throw e;
  }
}

async function weeklyNumbers(admin: ReturnType<typeof createAdminClient>) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [nl, hot, q, pv] = await Promise.all([
    admin.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", since),
    admin.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("score", 80),
    admin.from("lead_activities").select("id", { count: "exact", head: true }).eq("to_stage", "quotation_submitted").gte("created_at", since),
    admin.from("leads").select("estimated_value").is("deleted_at", null).not("stage", "in", "(lost,project_awarded)").limit(20000),
  ]);
  return { new_leads: nl.count ?? 0, hot: hot.count ?? 0, quotations: q.count ?? 0, pipeline_value: (pv.data ?? []).reduce((s, r) => s + Number(r.estimated_value ?? 0), 0) };
}
