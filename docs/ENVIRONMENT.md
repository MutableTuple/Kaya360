# Environment variables

Only variables prefixed `NEXT_PUBLIC_` reach the browser. Every API key is read server-side only, in route handlers and modules marked `server-only`.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key; RLS protects all data |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only. Used for invitations, cron jobs, integration secrets and usage logging |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL (OAuth redirect, calendar feed, email links) |
| `APP_ENCRYPTION_KEY` | yes | 32+ characters. AES-256-GCM key for stored API keys and Gmail tokens, and the HMAC key for OAuth state and calendar links |
| `CRON_SECRET` | yes for automation | Bearer token required by `/api/cron/*` |
| `OPENAI_API_KEY` | for discovery and assistant | Extraction, assistant, query interpretation |
| `OPENAI_MODEL` | no (default `gpt-4o-mini`) | Must support `response_format: json_schema` and tools |
| `OPENAI_COST_IN` / `OPENAI_COST_OUT` | no | USD per 1M tokens, used for budget estimates |
| `SERPER_API_KEY` | one search API required | Serper.dev Google results |
| `HUNTER_API_KEY` | one verifier recommended | Domain search, email finder, verifier |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | for sending email | Gmail OAuth web client |
| `GMAIL_TRACK_REPLIES` | no | `true` requests the `gmail.metadata` scope and enables **Check replies** |
| `NOMINATIM_CONTACT_EMAIL` | no | Contact email in the Nominatim User-Agent, as its usage policy requires |

Generate secrets with `openssl rand -base64 48`.

Search, verification, OpenAI, Gmail client and Maps keys can also be entered by an administrator in **Settings → Integrations**. They are stored encrypted in `integration_secrets`, a table with no RLS policy, so only the service role can read it.
