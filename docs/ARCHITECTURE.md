# Architecture

```
Browser (React, no secrets) ──► Next.js route handlers (/api/*) ──► Supabase PostgREST (user JWT → RLS)
                                    │                                 └► Supabase Storage (private bucket)
                                    ├► OpenAI · Serper · Hunter · Gmail · OpenStreetMap
                                    └► Service-role client (cron, invitations, secrets, usage logs only)
Vercel Cron / pg_cron ──► /api/cron/{tick,daily,weekly,monthly} (Bearer CRON_SECRET)
```

## Data model (supabase/migrations)

The 20 core tables:
`profiles`, `companies`, `projects`, `leads`, `contacts`, `project_stakeholders`, `lead_sources`, `lead_activities`, `follow_ups`, `tenders`, `tender_documents`, `discovery_jobs`, `saved_searches`, `email_verifications`, `email_templates`, `email_logs`, `notifications`, `team_assignments`, `audit_logs`, `application_settings`.

Support tables:
- `discovery_results`: the review queue
- `project_attachments`
- `email_accounts`: encrypted OAuth tokens
- `integration_secrets`: service-role only
- `integration_usage`: calls, cost and errors
- `scheduled_job_runs`

**De-duplication** is enforced by the database, not just the UI. Partial unique indexes cover:
- companies by normalised name and by website domain
- projects by normalised name plus city, and by source URL plus name
- contacts by company plus normalised name, and by direct email
- one active lead per project
- tenders by organisation plus reference number, and by source URL plus title

**Soft deletion** (`deleted_at`) applies to projects, companies, contacts, leads and tenders. Leads also have `archived_at`.

**Lead score** is `score_auto` (engine) plus `score_adjustment` (manual, reason required by a CHECK constraint). `score` and `priority` are generated columns. `score_breakdown` stores the per-criterion explanation.

## Security model

- **Roles:** administrator, bd_manager, sales_executive, researcher, viewer.
- **Helper functions** are `SECURITY DEFINER`: `is_member()`, `can_write()`, `is_manager()`, `is_admin()`. They check `profiles.is_active`.
- **RLS:**
  - members read
  - writers (admin, BD manager, sales, researcher) insert and update
  - managers hard-delete and read audit logs and API usage
  - admin manages settings and users
  - `integration_secrets` has no policy at all
- A trigger blocks non-admin role or activation changes and protects the last administrator.
- The generic audit trigger records INSERT, UPDATE (changed fields only), DELETE, SOFT_DELETE and RESTORE with the actor. App events (EXPORT, CONFIG) are inserted by the user and restricted by policy.
- API routes re-check roles, validate with Zod, sanitise control characters, and apply per-user sliding-window rate limits. The monthly API budget and per-provider call limits are enforced before every paid call.
- **Page fetcher:**
  - Blocks private and loopback addresses (SSRF), including after redirects.
  - Respects robots.txt and caps size and time.
  - Never fetches LinkedIn or other login-walled social sites; only their search snippets are used.

## Discovery engine (src/lib/discovery)

1. `queries.ts` deterministically expands geography × categories × stage × keywords into search queries. They are interleaved so a capped job still covers every selected city. The queries are shown to the user.
2. `engine.ts`:
   - Each job advances in leased time slices. A `lock_until` lease prevents two workers running the same job, and state is persisted after every query, so pause, resume and cancel are safe and the job survives restarts.
   - For each query it runs a multi-provider search with fallback and merging. It then fetches each source page, or uses only the snippet for restricted sites.
   - OpenAI extracts structured records against a strict JSON schema. `grounding.ts` removes anything the source does not support.
   - Duplicates are checked against the database, and the result goes into `discovery_results` for review.
3. `save.ts` (on user approval):
   - Upserts the client company and stakeholder companies.
   - Inserts the project, its source and any contacts named in the source.
   - Creates the lead and computes its score.
4. Decision-maker jobs first use Hunter domain search (only emails with public sources and a named person). They then run public web and LinkedIn-snippet searches restricted to the company.

## AI assistant (src/lib/assistant.ts)

The assistant uses OpenAI tool-calling with **database-only tools**: leads, follow-ups, no-response emails, projects, companies, contacts, tenders, and creating email drafts. A `propose_research` tool only returns a proposal; the user must click **Start research**. The system prompt forbids claiming web access.
