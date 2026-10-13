# Environment variables

Template: [`.env.example`](.env.example). `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time — never put secrets there. Everything else is read only on the server. The admin page **Integrations** (`/admin/integrations`) shows which groups are configured without revealing values.

| Variable | Required | Scope | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes (prod) | public | Canonical origin for links, sitemap, emails, payment callbacks. No trailing slash. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | public | Supabase project URL. Without it the site runs in "not configured" mode. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public | Supabase anon key (safe to expose; RLS protects data). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **secret** | Signed storage URLs, webhooks, workers. Never expose. |
| `PAYMENTS_PROVIDER` | no | server | `paymob` or `sandbox`. Default: `sandbox` if sandbox enabled, else `paymob`. |
| `PAYMOB_SECRET_KEY` | for live payments | **secret** | Paymob secret key (Intention API, refunds). |
| `PAYMOB_PUBLIC_KEY` | for live payments | server | Used to build the unified checkout URL. |
| `PAYMOB_HMAC_SECRET` | for live payments | **secret** | Verifies transaction callbacks. |
| `PAYMOB_INTEGRATION_IDS` | for live payments | server | Comma-separated integration IDs (card, wallets…). |
| `PAYMOB_MODE` | no | server | `test` (default) or `live`; stored on each payment. |
| `PAYMOB_API_BASE` | no | server | Default `https://accept.paymob.com`. |
| `PAYMENTS_SANDBOX_ENABLED` | no | server | `true` enables the simulated gateway. **Never in production.** |
| `PAYMENTS_SANDBOX_SECRET` | with sandbox | **secret** | HMAC key for sandbox callbacks. |
| `DAILY_API_KEY` | for video/voice | **secret** | Daily.co REST key (rooms + meeting tokens). |
| `ANTHROPIC_API_KEY` | for AI | **secret** | Claude API key. |
| `AI_MODEL` | no | server | Default `claude-opus-5-5`. |
| `CLAMAV_SCAN_URL` | recommended | server | ClamAV REST endpoint for upload scanning. |
| `CLAMAV_SCAN_TOKEN` | optional | **secret** | Bearer token for the scanner. |
| `RESEND_API_KEY` | for email | **secret** | Transactional email. |
| `EMAIL_FROM` | for email | server | Verified sender, e.g. `Qanony <no-reply@your-domain>`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | for SMS | **secret** / server | SMS delivery. |
| `WHATSAPP_ACCESS_TOKEN` | for WhatsApp | **secret** | Meta Cloud API token. |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | server | Sender phone number ID. |
| `WHATSAPP_TEMPLATE_NAME` | for WhatsApp | server | Approved template with two body params (title, body) in `ar` and `en`. |
| `WHATSAPP_API_VERSION` | no | server | Default `v21.0`. |
| `CRON_SECRET` | yes (prod) | **secret** | ≥16 chars. Bearer token for `/api/cron/*`. Vercel Cron sends it automatically when set. |
| `E2E_*` | tests only | — | See TESTING.md. |

Notes
- Supabase Auth email templates, SMTP, redirect URLs and MFA are configured in the Supabase dashboard, not via these variables.
- Unconfigured notification channels are recorded as `skipped` per delivery; in-app notifications always work.
- Rotate `PAYMOB_HMAC_SECRET`, `PAYMENTS_SANDBOX_SECRET`, `CRON_SECRET` and the service-role key if they are ever exposed; all are read at request time.
