# KAYA PROJECT INTELLIGENCE 360

AI-powered project lead generation and business-development CRM for **Kaya Interiors Private Limited** (www.kayainteriors.in).

It discovers interior-contracting opportunities across India through real web research. It also identifies decision-makers from public sources, verifies emails with real providers, and runs the whole pipeline from discovery to award. All data lives in Supabase PostgreSQL, protected by Row Level Security.

> **Nothing is simulated.** If an integration is not configured, the feature says so and shows what is missing. Discovery jobs move to `needs_configuration`, verification returns a configuration error, and sending is blocked. The app never returns placeholder results.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts, Leaflet/OpenStreetMap, dnd-kit |
| Backend | Next.js route handlers (server-only API keys), Zod validation, per-user rate limiting |
| Database/Auth/Storage | Supabase PostgreSQL + RLS, Supabase Auth (invite-only), Supabase Storage (private bucket) |
| AI | OpenAI chat completions with strict JSON-schema extraction and tool-calling assistant |
| Web research | Serper (Google results) |
| Verification/enrichment | Hunter (domain search, email finder, verifier) |
| Email | Gmail / Google Workspace via OAuth 2.0, sending from each user's own mailbox |
| Automation | Vercel Cron or Supabase pg_cron → `/api/cron/{tick,daily,weekly,monthly}` |
| Exports | ExcelJS (.xlsx), CSV with formula-injection guard, jsPDF (branded PDF reports) |

## Modules (sidebar)

Dashboard · AI Lead Discovery · All Projects · Lead Database · Companies · Decision Makers · Hot Leads · Project Pipeline (drag-and-drop) · India Opportunity Map · Tenders & RFQs · Follow-up Calendar (with iCal subscription) · Email Centre · Reports & Analytics · Team Management · Settings. The top bar has global search (Ctrl K), notifications, quick-add, the AI BD assistant, help, settings and the profile menu.

## How accuracy is enforced (anti-fabrication)

1. **Grounding checks in code** (`src/lib/discovery/grounding.ts`), applied to every AI extraction:
   - The evidence quote must appear verbatim in the fetched source. If it doesn't, the record is downgraded to *Unverified announcement*.
   - *Confirmed requirement* also needs explicit tender/contractor/vendor wording. Otherwise it becomes *Potential opportunity*.
   - People are kept only if their name appears in the source. Their emails and phone numbers are kept only if written there.
   - Areas, values, dates, stakeholders, tender reference numbers and deadlines are removed when the source doesn't print them.
2. **Emails are never guessed.** Hunter Email Finder results are attached to a person only when Hunter reports public sources. Pattern-based guesses are shown as information and never saved.
3. **Email format alone is never "verified".** Only a provider response sets the status: Verified, Invalid, Catch-all, Unknown, Pending or Not checked.
4. **Company-level and direct details are separate fields** (for example `company_email` and `direct_email`), and each phone number carries a status.
5. **Scoring never rewards missing data.** Unknown always scores 0 for its criterion, and every point has a written reason.
6. **LinkedIn and other login-walled sites** are used only through public search-engine snippets. They are never scraped, and `robots.txt` is respected for every fetched page.
7. **DEMO data** is flagged `is_demo`, prefixed `[DEMO]`, uses `example.com`, and is excluded from reports by default.

## Quick start (local)

```bash
cp .env.example .env.local        # fill in Supabase + at least OpenAI and one search API
npm install
# apply supabase/migrations/*.sql to your Supabase project (see docs/DEPLOYMENT.md)
npm run dev                       # http://localhost:3000
```
The first user to sign up becomes **Administrator**. Then disable public sign-ups and invite everyone else from Team Management.

## Documentation

- `docs/DEPLOYMENT.md`: Supabase, Vercel, Google OAuth and cron setup
- `docs/ENVIRONMENT.md`: every environment variable
- `docs/TESTING.md`: automated tests and the manual acceptance checklist
- `docs/ARCHITECTURE.md`: data model, security model, discovery engine

## Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` (unit) · `npm run db:test` (migrations and RLS on a throwaway local PostgreSQL)
