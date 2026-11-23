# Deployment

## 1. Supabase

1. Create a project at supabase.com. The Mumbai region (ap-south-1) is recommended for Indian data residency.
2. **Apply the migrations in order.** Use either:
   - The Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - The SQL Editor: paste and run each file in `supabase/migrations/`, oldest first.
   The migrations create 20 core tables plus support tables, enums, indexes, unique de-duplication constraints, audit triggers, RLS policies, reporting functions, views, the private `attachments` storage bucket, default settings and the 10 system email templates.
3. **Authentication → Providers → Email.** Keep Email enabled and **turn off “Allow new users to sign up”** once the first administrator has signed up.
4. **Authentication → URL configuration.**
   - Site URL: your app URL.
   - Redirect URLs: add `https://<app>/auth/callback`. This route handles invitation and password-reset links.
5. **Authentication → Email templates (optional).** Brand the Invite and Reset Password emails.
6. **Project Settings → API.** Copy the URL, the `anon` key and the `service_role` key.

> The first account ever created becomes **Administrator**. Every later account is a **Viewer** until an administrator invites it with a role or changes its role. Roles are never read from user-supplied metadata.

## 2. Vercel (recommended)

1. Import the repository into Vercel (framework: Next.js).
2. Add the environment variables from `docs/ENVIRONMENT.md` in Project → Settings → Environment Variables.
3. Deploy, then set `NEXT_PUBLIC_APP_URL` to the production URL and redeploy.
4. **Cron.** `vercel.json` defines `tick` (every 10 minutes), `daily`, `weekly` and `monthly` jobs. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`.
   - The Hobby plan only allows daily crons. On Hobby, remove the `tick` entry and use `supabase/cron_pg_cron.sql` for the 10-minute tick instead.
5. Long-running routes declare `maxDuration = 60`. Discovery runs in persisted ~40-second slices, so it survives serverless limits. It resumes from the browser or from the cron tick.

Any Node 20+ host works too (`npm run build && npm start`). In that case, call the cron URLs with your scheduler of choice.

## 3. Google OAuth (Email Centre)

1. Google Cloud Console → APIs & Services → enable the **Gmail API**.
2. OAuth consent screen:
   - Choose **Internal** if Kaya uses Google Workspace. This avoids Google's app verification.
   - Add the scopes `gmail.send`, `openid` and `email`. If you set `GMAIL_TRACK_REPLIES=true`, also add `gmail.metadata`.
3. Credentials → OAuth client ID → Web application.
   - Authorised redirect URI: `https://<app>/api/email/oauth/callback`
4. Put the client ID and secret into `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. Alternatively, an admin can enter them in Settings → Integrations.
5. Each user then opens Email Centre and clicks **Connect Gmail**. Refresh tokens are AES-256-GCM encrypted in `email_accounts`.

## 4. Integrations

Open **Settings → Integrations**. For each provider you can:
- See its status and where its credentials come from (environment variable or encrypted database).
- Press **Test connection**, which makes a real minimal API call.
- See this month's calls, errors and estimated cost.
- Set a monthly call limit.

Keys entered in the UI are encrypted server-side with `APP_ENCRYPTION_KEY` and never returned to the browser. Environment variables take precedence over stored keys.

The minimum for discovery is **OpenAI plus Serper**. For contact verification, add **Hunter**. Hunter also powers *Find business email* and its domain search feeds *Find decision makers*.

## 5. Go-live checklist

- [ ] Migrations applied; `select count(*) from email_templates` returns 10
- [ ] First admin signed up; public sign-ups disabled; team invited with roles
- [ ] Settings → Company: introduction, address and services filled in (these are used in email templates)
- [ ] Settings → Integrations: every needed provider shows Configured and passes **Test connection**
- [ ] Settings → Lead generation: monthly API budget set
- [ ] Settings → Automation: enabled only after a manual discovery run looks right
- [ ] `CRON_SECRET` set; Reports shows scheduled runs after the first cron fires
- [ ] Each sales user has connected Gmail and filled in designation and phone (My profile) for email signatures

## Data protection

- Only publicly available business information and approved enrichment APIs are used. There is no scraping of private accounts and no authentication bypass.
- RLS restricts all data to active members. Deactivating a user revokes access immediately.
- All changes are audit-logged with the actor, and exports are logged too.
- Kaya should maintain a privacy notice and honour opt-out and erasure requests in line with the Digital Personal Data Protection Act, 2023. Contacts can be permanently deleted by a manager from the record, and the audit log keeps who did it.
