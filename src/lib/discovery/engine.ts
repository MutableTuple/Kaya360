import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import {
  webSearch,
  canonicalUrl,
  type SearchHit,
} from "../integrations/search";
import {
  getCredentials,
  configuredProviders,
  SEARCH_PROVIDERS,
} from "../integrations/registry";
import { hunterDomainSearch } from "../integrations/verify";
import {
  findCompanyContacts,
  findWebsite,
  type FoundContacts,
} from "../contactFinder";
import { fetchPage, snippetOnly } from "../fetchPage";
import { extractPeople, extractProjects, extractTenders } from "./extract";
import {
  buildDecisionMakerQueries,
  buildProjectQueries,
  buildTenderQueries,
  type DiscoveryParams,
} from "./queries";
import { normalizeText, projectDedupeKey } from "../normalize";
import { scoreLead } from "../scoring";
import { resolveGeography } from "../geo";
import { ROLE_GROUPS } from "../constants";
import { HttpError } from "../api";

export interface JobStats {
  queries_executed: number;
  websites_researched: number;
  projects_identified: number;
  companies_identified: number;
  contacts_discovered: number;
  duplicates_removed: number;
  awaiting_review: number;
  api_errors: number;
}
type Job = {
  id: string;
  kind: "projects" | "tenders" | "decision_makers";
  params: DiscoveryParams;
  status: string;
  queries: {
    q: string;
    status: string;
    results?: number;
    providers?: string[];
    error?: string;
  }[];
  cursor: number;
  visited_urls: string[];
  stats: JobStats;
  errors: { at: string; message: string; query?: string; url?: string }[];
  created_by: string | null;
};

/** Check required integrations before a job may start. Returns missing pieces (empty = ready). */
export async function missingForDiscovery(kind: Job["kind"]) {
  const missing: string[] = [];
  if (!(await configuredProviders(SEARCH_PROVIDERS)).length)
    missing.push("Serper web search API (SERPER_API_KEY)");
  if (!(await getCredentials("openai")))
    missing.push("OpenAI API key (OPENAI_API_KEY) for source extraction");
  // if (kind === "decision_makers" && missing.length === 2 && (await getCredentials("hunter"))) return []; // Hunter disabled // Hunter alone can run DM search
  return missing;
}

export function planQueries(
  kind: Job["kind"],
  params: DiscoveryParams,
): string[] {
  if (kind === "tenders") return buildTenderQueries(params);
  if (kind === "decision_makers") {
    const groups = params.roleGroups?.length
      ? params.roleGroups
      : Object.keys(ROLE_GROUPS);
    return buildDecisionMakerQueries(
      params,
      groups.flatMap((g) => ROLE_GROUPS[g]?.titles ?? []),
    );
  }
  return buildProjectQueries(params);
}

async function loadExistingKeys(admin: SupabaseClient) {
  const [{ data: p }, { data: c }] = await Promise.all([
    admin
      .from("projects")
      .select("id,dedupe_key,primary_source_url")
      .is("deleted_at", null)
      .limit(50000),
    admin
      .from("companies")
      .select("id,normalized_name")
      .is("deleted_at", null)
      .limit(50000),
  ]);
  return {
    projects: new Map(
      (p ?? []).map((r) => [r.dedupe_key as string, r.id as string]),
    ),
    projectUrls: new Map(
      (p ?? [])
        .filter((r) => r.primary_source_url)
        .map((r) => [
          canonicalUrl(r.primary_source_url as string),
          r.id as string,
        ]),
    ),
    companies: new Map(
      (c ?? []).map((r) => [r.normalized_name as string, r.id as string]),
    ),
  };
}

/**
 * Advance a discovery job for up to `budgetMs`. Safe to call concurrently:
 * a lease (`lock_until`) guarantees one worker per job. Progress is persisted
 * after every query, so pause/cancel take effect at the next query boundary.
 */
export async function runJobStep(jobId: string, budgetMs = 40_000) {
  const admin = createAdminClient();
  const started = Date.now();
  const lease = new Date(Date.now() + budgetMs + 30_000).toISOString();
  const { data: locked } = await admin
    .from("discovery_jobs")
    .update({ lock_until: lease })
    .eq("id", jobId)
    .eq("status", "running")
    .or(`lock_until.is.null,lock_until.lt."${new Date().toISOString()}"`)
    .select("*")
    .maybeSingle();
  if (!locked) return { advanced: false };
  const job = locked as unknown as Job;
  const params = job.params;
  const geoLabel = resolveGeography(params.geography ?? { scope: "all" }).label;
  const lg = (
    await admin
      .from("application_settings")
      .select("value")
      .eq("key", "lead_generation")
      .maybeSingle()
  ).data?.value as { max_pages_per_query?: number } | undefined;
  const maxPages = Math.max(
    1,
    Math.min(Number(lg?.max_pages_per_query ?? 4), 10),
  );
  const weights =
    (
      await admin
        .from("application_settings")
        .select("value")
        .eq("key", "scoring_weights")
        .maybeSingle()
    ).data?.value ?? {};
  const existing =
    job.kind === "projects" ? await loadExistingKeys(admin) : null;
  const visited = new Set(job.visited_urls);
  const companiesSeen = new Set<string>();
  // Company contact point (email / phone printed on the company's own website), looked up once per company per slice.
  const contactCache = new Map<string, FoundContacts | null>();
  const companyContact = async (
    company: string | null,
    website: string | null,
    city: string | null,
  ): Promise<FoundContacts | null> => {
    const key = normalizeText(company ?? "");
    if (!key) return null;
    if (contactCache.has(key)) return contactCache.get(key)!;
    let out: FoundContacts | null = null;
    try {
      const { data: known } = await admin
        .from("companies")
        .select("website,official_email,official_phone")
        .eq("normalized_name", key)
        .is("deleted_at", null)
        .maybeSingle();
      if (known?.official_email || known?.official_phone) {
        out = {
          website: known.website,
          emails: known.official_email ? [known.official_email] : [],
          phones: known.official_phone ? [known.official_phone] : [],
          sourceUrl: known.website,
        };
      } else {
        const site =
          website ??
          known?.website ??
          (await findWebsite(company!, city).catch(() => null));
        if (site) out = await findCompanyContacts(site);
      }
    } catch (e) {
      errors.push({
        at: new Date().toISOString(),
        message: `Contact lookup for ${company}: ${(e as Error).message}`,
      });
    }
    contactCache.set(key, out);
    return out;
  };
  const stats = job.stats;
  const errors = job.errors;
  const userId = job.created_by ?? undefined;

  const persist = async (extra: Record<string, unknown> = {}) => {
    const { count } = await admin
      .from("discovery_results")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("review_status", "pending");
    stats.awaiting_review = count ?? 0;
    await admin
      .from("discovery_jobs")
      .update({
        cursor: job.cursor,
        queries: job.queries,
        visited_urls: [...visited].slice(-3000),
        stats,
        errors: errors.slice(-200),
        ...extra,
      })
      .eq("id", jobId);
  };
  const addResult = async (r: Record<string, unknown>) => {
    const { error } = await admin
      .from("discovery_results")
      .insert({ job_id: jobId, ...r });
    if (error && error.code !== "23505")
      errors.push({
        at: new Date().toISOString(),
        message: `Saving result failed: ${error.message}`,
      });
    return !error;
  };

  try {
    // Decision-maker jobs: Hunter domain search first (publicly sourced emails with source URLs)
    if (
      job.kind === "decision_makers" &&
      job.cursor === 0 &&
      params.companyDomain &&
      false /* Hunter disabled: (await getCredentials("hunter")) */
    ) {
      try {
        const d = await hunterDomainSearch(params.companyDomain!, {
          limit: 25,
          userId,
        });
        for (const e of d.emails ?? []) {
          const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
          if (!name) continue; // generic inboxes are saved as company-level emails, not people
          const src = e.sources?.[0]?.uri;
          if (!src) continue; // no public source → not attached to a person
          stats.contacts_discovered++;
          await addResult({
            result_type: "contact",
            title: `${name} — ${e.position ?? "Role not stated"}`,
            source_url: src,
            source_title: "Hunter domain search",
            payload: {
              name,
              designation: e.position,
              company: params.companyName,
              email: e.value,
              email_confidence: e.confidence,
              email_type: e.type,
              phone: e.phone_number,
              linkedin_url: e.linkedin,
              department: e.department,
              source: "hunter",
              sources: e.sources.slice(0, 5).map((s) => s.uri),
              hunter_verification: e.verification ?? null,
            },
          });
        }
      } catch (e) {
        stats.api_errors++;
        errors.push({
          at: new Date().toISOString(),
          message: `Hunter: ${(e as Error).message}`,
        });
      }
    }

    while (job.cursor < job.queries.length && Date.now() - started < budgetMs) {
      const { data: s } = await admin
        .from("discovery_jobs")
        .select("status")
        .eq("id", jobId)
        .single();
      if (s?.status !== "running") break;
      const item = job.queries[job.cursor];
      let hits: SearchHit[] = [];
      try {
        const r = await webSearch(item.q, {
          num: 10,
          freshness: params.period,
          news: job.kind === "projects" && job.cursor % 2 === 1,
          jobId,
          userId,
        });
        hits = r.hits;
        item.providers = r.providers;
        item.results = hits.length;
        item.status = "done";
        for (const e of r.errors) {
          stats.api_errors++;
          errors.push({
            at: new Date().toISOString(),
            message: e.error,
            query: item.q,
          });
        }
      } catch (e) {
        item.status = "error";
        item.error = (e as Error).message;
        stats.api_errors++;
        errors.push({
          at: new Date().toISOString(),
          message: (e as Error).message,
          query: item.q,
        });
        if (
          (e as HttpError).status === 402 ||
          (e as HttpError).status === 503
        ) {
          job.cursor++;
          await persist({
            status:
              (e as HttpError).status === 503
                ? "needs_configuration"
                : "paused",
          });
          return { advanced: true, stopped: (e as Error).message };
        }
      }
      stats.queries_executed++;

      let pages = 0;
      for (const h of hits) {
        if (pages >= maxPages || Date.now() - started > budgetMs + 10_000)
          break;
        const key = canonicalUrl(h.url);
        if (visited.has(key)) continue;
        visited.add(key);
        if (existing?.projectUrls.has(key)) {
          stats.duplicates_removed++;
          continue;
        }
        pages++;
        let text = `${h.title}\n${h.snippet}`;
        let title = h.title;
        let date = h.date;
        if (!snippetOnly(h.url)) {
          try {
            const pg = await fetchPage(h.url);
            if (pg.text && pg.text.length > 200) {
              text = `${pg.title || h.title}\n${pg.text}`;
              title = pg.title || h.title;
              date = pg.publishedAt ?? h.date;
            }
          } catch (e) {
            errors.push({
              at: new Date().toISOString(),
              message: `Fetch failed (snippet used): ${(e as Error).message}`,
              url: h.url,
            });
          }
        }
        stats.websites_researched++;
        try {
          if (job.kind === "projects") {
            const found = await extractProjects(
              { url: h.url, title, text, date },
              {
                geography: geoLabel,
                categories: params.categories,
                jobId,
                userId,
              },
            );
            for (const p of found) {
              stats.projects_identified++;
              const ck = normalizeText(p.client_company);
              if (ck && !companiesSeen.has(ck)) {
                companiesSeen.add(ck);
                stats.companies_identified++;
              }
              stats.contacts_discovered += p.contacts.length;
              const dupId = existing!.projects.get(
                projectDedupeKey(p.name, p.city),
              );
              const preview = scoreLead(
                {
                  ...p,
                  primary_source_url: h.url,
                  verification_status: "unverified",
                },
                p.contacts.map((c) => ({
                  designation: c.designation,
                  role_group: c.designation ? "other" : null,
                })),
                weights,
              );
              if (dupId) stats.duplicates_removed++;
              const cc = dupId
                ? null
                : await companyContact(
                    p.client_company,
                    p.client_website,
                    p.city,
                  );
              if (cc && (cc.emails.length || cc.phones.length))
                stats.contacts_discovered++;
              const client_contact =
                cc && (cc.emails.length || cc.phones.length) ? cc : null;
              await addResult({
                result_type: "project",
                title: p.name,
                source_url: h.url,
                source_title: title,
                opportunity_class: p.opportunity_class,
                preview_score: preview.score,
                payload: {
                  ...p,
                  client_contact,
                  source_date: date ?? null,
                  snippet: h.snippet,
                  search_provider: h.provider,
                },
                review_status: dupId ? "duplicate" : "pending",
                duplicate_of: dupId ?? null,
                duplicate_reason: dupId
                  ? "Same project name and city already in database"
                  : null,
              });
            }
          } else if (job.kind === "tenders") {
            const found = await extractTenders(
              { url: h.url, title, text },
              { geography: geoLabel, jobId, userId },
            );
            for (const t of found) {
              stats.projects_identified++;
              let dup: string | null = null;
              if (t.reference_number) {
                const { data } = await admin
                  .from("tenders")
                  .select("id")
                  .eq("reference_number", t.reference_number)
                  .is("deleted_at", null)
                  .limit(1);
                dup = data?.[0]?.id ?? null;
              }
              if (!dup) {
                const { data } = await admin
                  .from("tenders")
                  .select("id")
                  .eq("source_url", h.url)
                  .eq("title", t.title)
                  .is("deleted_at", null)
                  .limit(1);
                dup = data?.[0]?.id ?? null;
              }
              if (dup) stats.duplicates_removed++;
              await addResult({
                result_type: "tender",
                title: t.title,
                source_url: h.url,
                source_title: title,
                payload: t,
                review_status: dup ? "duplicate" : "pending",
                duplicate_of: dup,
                duplicate_reason: dup ? "Tender already tracked" : null,
              });
            }
          } else {
            const titles = (
              params.roleGroups?.length
                ? params.roleGroups
                : Object.keys(ROLE_GROUPS)
            ).flatMap((g) => ROLE_GROUPS[g]?.titles ?? []);
            const people = await extractPeople(
              { url: h.url, title, text },
              { company: params.companyName ?? "", titles, jobId, userId },
            );
            for (const p of people) {
              stats.contacts_discovered++;
              const linkedin = /linkedin\.com\/in\//i.test(h.url)
                ? h.url.split("?")[0]
                : p.linkedin_url;
              await addResult({
                result_type: "contact",
                title: `${p.name} — ${p.designation ?? "Role not stated"}`,
                source_url: h.url,
                source_title: title,
                payload: { ...p, linkedin_url: linkedin, source: "web" },
              });
            }
          }
        } catch (e) {
          stats.api_errors++;
          errors.push({
            at: new Date().toISOString(),
            message: `Extraction: ${(e as Error).message}`,
            url: h.url,
          });
          if (
            (e as HttpError).status === 503 ||
            (e as HttpError).status === 402
          ) {
            await persist({
              status:
                (e as HttpError).status === 503
                  ? "needs_configuration"
                  : "paused",
            });
            return { advanced: true, stopped: (e as Error).message };
          }
        }
      }
      job.cursor++;
      await persist();
    }

    const done = job.cursor >= job.queries.length;
    await persist(
      done
        ? {
            status: "completed",
            finished_at: new Date().toISOString(),
            lock_until: null,
          }
        : { lock_until: null },
    );
    if (done && job.created_by) {
      await admin
        .from("notifications")
        .insert({
          user_id: job.created_by,
          kind: "discovery_complete",
          title: `Discovery complete: ${stats.awaiting_review} result(s) awaiting review`,
          body: `${stats.queries_executed} queries, ${stats.websites_researched} websites researched.`,
          link: `/discovery?job=${jobId}`,
          dedupe_key: `job:${jobId}`,
        });
    }
    return { advanced: true, done };
  } catch (e) {
    errors.push({
      at: new Date().toISOString(),
      message: (e as Error).message,
    });
    await persist({
      status: "failed",
      lock_until: null,
      finished_at: new Date().toISOString(),
    });
    return { advanced: true, error: (e as Error).message };
  }
}

/** Create a job (validates integrations first — never pretends to run without them). */
export async function createJob(
  db: SupabaseClient,
  kind: Job["kind"],
  params: DiscoveryParams,
  userId: string | null,
  trigger: "manual" | "schedule" | "assistant" = "manual",
  title?: string,
) {
  const missing = await missingForDiscovery(kind);
  const queries = planQueries(kind, params).map((q) => ({
    q,
    status: "pending",
  }));
  if (kind === "decision_makers" && !params.companyName)
    throw new HttpError(
      400,
      "Select a company to research decision-makers for.",
    );
  const row = {
    kind,
    params,
    title:
      title ??
      `${kind === "projects" ? "Projects" : kind === "tenders" ? "Tenders" : "Decision makers"} · ${kind === "decision_makers" ? params.companyName : resolveGeography(params.geography ?? { scope: "all" }).label}`,
    status: missing.length ? "needs_configuration" : "running",
    queries,
    trigger,
    created_by: userId,
    started_at: missing.length ? null : new Date().toISOString(),
    errors: missing.length
      ? [
          {
            at: new Date().toISOString(),
            message: `Missing configuration: ${missing.join("; ")}`,
          },
        ]
      : [],
  };
  const { data, error } = await db
    .from("discovery_jobs")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return { job: data, missing };
}
