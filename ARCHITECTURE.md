# Architecture

## Principles

1. **The database is the authority.** Every business rule that protects money, privacy or availability lives in Postgres — RLS policies, `security definer` RPCs, triggers, exclusion constraints. The Next.js layer validates input for good UX, then calls the database *as the signed-in user*. A bug in the UI cannot bypass a rule.
2. **Least privilege.** The browser only has the anon key. The service-role client (`src/lib/supabase/admin.ts`, `server-only`) is used in exactly these places, always *after* an authorisation decision made by the database or a verified signature:
   - signed storage URLs for uploads/downloads (after `create_document_upload` / `authorize_document_download`),
   - payment webhooks (after signature verification) and the payment return route,
   - scheduled jobs (`/api/cron/*`, bearer secret),
   - AI usage/access logging, admin email lookup (after staff-scoped reads succeed).
3. **Arabic first.** Arabic at `/` (RTL), English at `/en` (LTR); logical CSS properties throughout; all copy in `messages/`.
4. **Honest integrations.** Every provider has a typed adapter, configuration via environment variables, and an explicit "not configured" state. Nothing reports success without a provider response.

## High-level view

```
Browser ──► Next.js (Vercel)
             ├─ proxy.ts: locale negotiation, Supabase session refresh, coarse auth redirect
             ├─ Server Components: read via Supabase (user JWT → RLS)
             ├─ Server Actions: zod validation → RPC / table write as the user
             ├─ Route handlers: uploads, downloads, webhooks, ICS, meetings, CSV, cron
             └─ Providers: Paymob · sandbox · Daily · Anthropic · Resend · Twilio · WhatsApp · ClamAV
                    │
                    ▼
           Supabase: Postgres (RLS, RPCs, triggers, ledger) · Auth · Storage (private bucket) · Realtime
```

## Route groups

| Group | Paths | Access |
|---|---|---|
| `(public)` | `/`, `/lawyers`, `/lawyers/[slug]`, `/book/[slug]`, `/services`, `/categories`, `/firms`, `/articles`, `/faq`, `/pricing`, `/cities/[gov]`, legal pages, `/assistant`, `/checkout/*` | Anyone (booking/checkout require login at action time) |
| `(auth)` | `/login`, `/register`, `/register/lawyer`, `/forgot-password`, `/reset-password` | Anyone |
| `(app)/client` | client portal | role `client` |
| `(app)/lawyer` | lawyer portal | role `lawyer` |
| `(app)/firm` | firm portal | active firm membership; each page checks a firm permission |
| `(app)/admin` | platform administration | `support` (limited), `admin`, `super_admin`; each page checks a platform permission |
| `(app)/(account)` | notifications, invitations, invoices, disputes, consultation room, create-firm | any signed-in user, row-level checks |

The whole `(app)` tree is `force-dynamic` and `noindex`.

## Authorisation layers

1. `proxy.ts` — redirects signed-out users away from portal prefixes (UX only).
2. Portal layouts — `requirePortal()` (roles from `my_context()`); firm pages use `getFirmContext()` + `can(permission)`; admin pages use `adminAccess(permission)`.
3. Server actions / route handlers — zod validation; same-origin check on cookie-authenticated JSON routes.
4. **Database** — RLS on every table; RPCs re-check roles (`app.is_admin()`, `app.has_permission()`, `app.firm_has_permission()`), ownership and state; column guards prevent privilege escalation (e.g. a lawyer cannot verify themself, publish before verification, or activate a service).

## Key flows

### Booking a paid consultation
1. `get_available_slots` computes slots from weekly availability, exceptions, existing bookings, buffers, min-notice and daily caps (TS mirror tested for parity).
2. `book_appointment` takes a per-lawyer advisory lock, re-validates the slot, inserts an appointment (`PENDING_PAYMENT` with a hold, or `PENDING_CONFIRMATION`/`CONFIRMED` if free). An exclusion constraint on `tstzrange` makes double-booking impossible for both lawyer and client.
3. `create_payment` creates an idempotent payment; the provider adapter creates a checkout (Paymob intention, or sandbox).
4. Webhook → adapter verifies HMAC → `record_payment_result` (single transaction): de-duplicates by `(provider, event_id)`, checks amount/currency, snapshots commission, writes balanced double-entry ledger lines, issues the invoice and advances the appointment (`CONFIRMED` or `PENDING_CONFIRMATION`). Late payments on expired holds are re-validated or refunded.
5. Notifications are written in-app and queued per channel; the cron worker delivers them.

### Consultation
`/consultation/[id]` → `/api/meetings/[id]/join` checks the join window (10 min before → 30 min after) and participation, creates/gets a private Daily room, and mints a short-lived meeting token for that user only.

### Documents
`POST /api/documents/upload` → `create_document_upload` authorises and returns a version path → signed upload URL → browser uploads directly → `POST /finalize` verifies size, magic bytes, sha256 and optional ClamAV scan, then `mark_document_uploaded` (service role). Downloads go through `authorize_document_download` (logged) and a 60-second signed URL. Stale, never-finalised uploads are removed by the `cleanup-uploads` job.

### Money
All amounts are `bigint` piasters. `financial_ledger_entries` is append-only with a deferred constraint that every transaction balances. Commission rules resolve by priority (service → lawyer → firm → promotion → global) and are snapshotted on the payment. Refunds: `admin_create_refund` / dispute resolution / cancellation policy → `refunds` queue → `refunds` cron job calls the provider → `complete_refund` reverses ledger lines proportionally. Settlements are prepared from the ledger balance and marked paid with a bank reference.

### Scheduled jobs (`src/lib/jobs.ts`, `/api/cron/[job]`)
| Job | Purpose |
|---|---|
| `expire-appointments` | release unpaid holds |
| `reminders` | queue 24h / 1h appointment and hearing reminders |
| `notifications` | deliver queued email/SMS/WhatsApp (skipped when unconfigured) |
| `refunds` | execute approved refunds at the gateway |
| `complete-orders` | auto-complete delivered service orders after the review window |
| `subscriptions` | renewals, grace period, expiry |
| `cleanup-uploads` | delete abandoned upload sessions |

### AI assistant
`src/features/ai` — public legal-information assistant and lawyer tools (summaries, drafting help, document Q&A). Gated by consent, per-tenant switches, plan entitlements and rate limits; documents are only sent when the owner enabled AI processing for that file. Every answer carries a "not legal advice" disclaimer; usage metadata (not content) is logged.

## Frontend conventions
- Server Components by default; client components only for interactivity.
- `src/components/ui` primitives, `src/components/shared` composites, feature components in `src/features/*/components`.
- Charts follow single-axis, labelled, table-view conventions (`src/components/charts`).
- Mutations return `ActionResult` (`ok | { error: ErrorKey }`); error keys map to `messages/*/errors.json`.
