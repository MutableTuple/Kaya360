# Testing

## Automated

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint (next/core-web-vitals)
npm test            # 39 unit tests (Vitest)
npm run db:test     # migrations + RLS/audit/dedupe/view tests on a throwaway local PostgreSQL 16
npm run build       # production build
```

| Suite | What it proves |
|---|---|
| `tests/scoring.test.ts` | 0 points for missing data. A fully evidenced lead scores 100. A `not_checked` email is never treated as verified. An unverified announcement gets no stage credit. Custom weights apply. Hot/warm/potential/low thresholds are correct. |
| `tests/grounding.test.ts` | A guessed email for a named person is removed. Invented people and stakeholders are dropped. A fabricated evidence quote is downgraded to Unverified. Confirmed is downgraded to Potential without requirement wording. Unsupported area, value and dates are removed. Invented tender reference numbers are removed. Tenders without a deadline never show as "active". |
| `tests/misc.test.ts` | Duplicate normalisation (matches SQL), URL canonicalisation, query generation covering every city, template placeholders, verification-status mapping for all three providers, robots.txt parsing, HTML extraction, rate limiting, role-group mapping, and MIME building with header-injection protection. |
| `tests/export.test.ts` | Real `.xlsx` with branding, headers and typed numeric cells (re-opened with ExcelJS). CSV escaping and formula-injection guard. A valid PDF is produced. |
| `tests/db/01_*.sql` | First user becomes admin. Self-promotion is blocked. Duplicate companies and projects are rejected. Score adjustments need a reason. Priority is derived from the score. Pipeline moves and score changes are logged to activity. Viewers are read-only. Sales cannot hard-delete. Soft deletes are audited with the actor. Dashboard functions run. The last admin cannot be demoted. Defaults are seeded. |
| `tests/db/02_*.sql` | Security-invoker views join correctly. Tender `closing_soon` status works. Users can write their own EXPORT audit rows but not forge DELETE rows. Deactivated users see nothing. |

The DB test script uses a minimal stub of Supabase's `auth` and `storage` schemas (`tests/db/supabase_stub.sql`). It needs `initdb`/`pg_ctl` (PostgreSQL 14+).

## Manual acceptance checklist (with real credentials)

These steps need live third-party APIs, so they must be run in a configured environment.

1. **Auth:** sign up the first user (becomes admin) → invite a Sales Executive → accept the invite → sign in → forgot-password email → reset.
2. **Integrations:** Settings → Integrations → **Test connection** on each configured provider. Each one makes a real call. Expect a green result, and see usage counted.
3. **Missing configuration:** remove the search key → start a discovery. The job shows *Needs configuration* with the exact missing variable, and no results appear.
4. **Discovery:** West India, Corporate offices, last 30 days, 6 queries → watch the counters → pause, resume, cancel a second job → open results. Every row has a source link, and grounding notes appear when fields were removed.
5. **Review & save:** save 2 results. This creates the project, company, stakeholders, lead and score. Re-run the same search: the same projects show as *Duplicate*. Choose **Add as source to existing**.
6. **Decision makers:** on a company with a website → Find decision makers → review → save contacts → on a contact: Find business email, Verify email, Find LinkedIn (confirm a candidate).
7. **Scoring:** verify a contact → the lead's "Verified business contact" criterion rises. Apply a manual adjustment with a reason; it appears in the activity history.
8. **Pipeline:** drag a card through stages → open the lead → each move appears in Activity and in the Audit trail (manager).
9. **Follow-ups:** set a reminder → it appears in the calendar and on the dashboard → subscribe to the iCal URL in Google Calendar → mark it done (the lead's last-contact date updates).
10. **Email:** connect Gmail → compose from the template for a contact → unfilled placeholders block sending → approve & send → the email arrives and the lead moves to *Introduction email sent*.
11. **Tenders:** discover tenders → save → convert to lead (creates a deadline follow-up) → closing-soon banner and daily notification appear.
12. **Map:** a project with an address → Locate on map → solid marker; an un-geocoded project shows a faded city-centre marker. Filters work.
13. **Exports:** every Excel, CSV and PDF in Reports opens correctly, respects the filters and date range, and is logged as EXPORT in the audit log.
14. **Roles:** as Viewer, edit and delete controls are hidden and API calls return 403. As Sales, permanent delete is refused. As Admin, change a role.
15. **Assistant:** "Which leads need follow-up today?" lists real records. "Find upcoming office projects in Mumbai" returns a *Start research* proposal and does not invent results.
16. **Mobile:** sidebar drawer, tables scroll horizontally, kanban scrolls, forms stack.
17. **Cron:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/daily` returns a summary, which appears under Reports → Scheduled automation runs.
18. **Demo data:** Settings → Demo data → load → records show the DEMO badge and are excluded from Reports → remove.
