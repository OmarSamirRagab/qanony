# Security

Qanony handles legally privileged information (issue descriptions, matter files, documents, messages) and money. This document lists the controls that exist in the code today and the hardening items that remain before production. Report vulnerabilities privately to the platform owner; do not open public issues.

## Threat model (summary)

| Asset | Main threats | Primary controls |
|---|---|---|
| Client issue summaries, matters, notes, documents, messages | cross-tenant reads (IDOR), staff over-reach, link leakage | RLS on every table, `app.can_access_document`, matter visibility helpers, 60-s signed URLs, private bucket without storage policies, staff permissions excluding legal content |
| Payments, ledger, payouts | forged webhooks, replay, amount tampering, double fulfilment, race conditions | HMAC verification, `(provider, event_id)` uniqueness, amount/currency checks, row locks, append-only balanced ledger, idempotency keys |
| Availability / bookings | double booking, slot races | advisory lock per lawyer + `exclude using gist` constraints (lawyer and client) |
| Accounts & roles | privilege escalation, self-verification | roles only via `admin_set_role` (super-admin for staff roles), column guard triggers, MFA support |
| Marketplace trust | fake verification, paid ranking disguised as organic | verification workflow with documented reasons + audit; `is_featured` (editorial) vs `sponsored_until` (always labelled); seed contains no fake lawyers/reviews |

## Controls

### Authentication & sessions
- Supabase Auth (email + password, magic link, TOTP MFA). Session cookies are `httpOnly` and refreshed in `src/proxy.ts` via `getClaims()` (JWT verified).
- Passwords ≥ 10 chars with letters and digits (`src/lib/validation.ts`); Supabase leaked-password protection should be enabled in the dashboard.
- Suspended / deleted accounts are blocked in `requireUser` and by `app.require_user()` (active profile required) at the start of user-facing RPCs.
- Redirect targets after login are restricted to same-site paths (`safeNextPath`).

### Authorisation
- **RLS on all 85 tables**, verified by `tests/security/rls.test.ts` (cross-tenant reads/writes, staff limits, document access, profile visibility, admin directory).
- `security definer` RPCs use `set search_path = ''` and fully-qualified names; helper functions live in the non-exposed `app` schema.
- `revoke execute … from public, anon, authenticated` on all functions, then an explicit allow-list (`20261013000009`, later migrations). Worker functions are `service_role`-only.
- Column guards: lawyers cannot change verification/publishing/featured/rating fields; services cannot be self-activated; documents' storage/scan fields are platform-managed; invoice and payment guards prevent tampering after issue.
- Support staff get identity and scheduling data only — never issue summaries, messages or documents. Admins see credential documents and dispute evidence only.
- Firm access uses per-member permissions (`app.firm_has_permission`), checked in the database and mirrored in the UI.

### Service-role usage
`src/lib/supabase/admin.ts` is `server-only` and used only after an authorisation decision: signed storage URLs, webhook processing (after signature checks), cron jobs (after bearer secret), AI/download logging, and email lookup for staff after a staff-scoped read succeeded. It is never sent to the browser.

### Input handling
- zod validation on every server action and route handler; database `check` constraints as the final guard.
- Uploads: MIME allow-list, size limit, magic-byte verification, sha256, optional ClamAV; infected files are quarantined and never downloadable. Filenames are sanitised for storage paths.
- Markdown rendering escapes HTML; the only `dangerouslySetInnerHTML` uses are JSON-LD blocks serialised with `<` escaped.
- CSV exports neutralise spreadsheet formulas.
- Outbound notification emails escape all content and never forward external links.
- Database rate limits on bookings (10/h), service orders (10/h), uploads (60/h), contact form (3/h per email) and AI (30 requests/h per user, enforced in the server action from `ai_usage_logs`).

### Transport & browser
`next.config.ts` sets CSP (`frame-ancestors 'none'`, `object-src 'none'`, restricted `connect-src`/`frame-src` to Supabase, Daily and Paymob), HSTS (2 years, preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/mic only for Daily), COOP; `poweredByHeader: false`; `/api/*` is `no-store`; downloads redirect with `Referrer-Policy: no-referrer`. Cookie-authenticated JSON routes require a same-origin `Origin`/`Referer`; server actions have built-in CSRF protection.

### Payments
- Webhooks are verified (Paymob HMAC-SHA512 over the documented fields; sandbox HMAC-SHA256) with constant-time comparison. The browser return URL never changes state.
- `record_payment_result` runs in one transaction: dedupe, signature check, amount/currency match, commission snapshot, balanced ledger, fulfilment. Late payments for lost slots are refunded automatically.
- The sandbox provider is disabled unless `PAYMENTS_SANDBOX_ENABLED=true` and must never be enabled in production; sandbox payments are labelled in every UI.

### Video
Private Daily rooms, per-user meeting tokens with expiry, join window enforcement, participants verified server-side. No recording is enabled.

### AI
Explicit consent, per-document opt-in for AI processing, tenant-level switches, plan entitlements, hourly limits, system prompts that forbid fabricating laws/cases, mandatory disclaimer, refusal handling, and metadata-only usage logging (no prompt/response content stored).

### Audit
Append-only `audit_logs` (trigger-protected) for role changes, account status, verification and firm decisions, placements, service moderation, review moderation, disputes, refunds, settlements, payouts, settings, commission rules and plans. `document_access_log` records uploads, downloads, shares and deletions. `payment_events` and `appointment_events` are append-only.

### Secrets
All secrets are environment variables (see `ENVIRONMENT_VARIABLES.md`); none are committed. The integrations page shows only whether a variable is set.

## Known gaps / required hardening before production

1. **CSP nonces** — scripts currently allow `'unsafe-inline'` (Next.js bootstrap). Move to nonce-based CSP via `proxy.ts` and drop `'unsafe-inline'`.
2. **Bank details encryption** — `settlement_accounts.account_identifier` is protected by RLS only. Encrypt with Supabase Vault / pgsodium (or store only a tokenised reference from the payout provider).
3. **Lawyer private details** (national ID, bar card numbers) — same recommendation as above.
4. **Malware scanning** — optional today (`CLAMAV_SCAN_URL`). Make it mandatory in production; files are marked `unscanned` otherwise.
5. **Supabase Auth settings** — enable leaked-password protection, enforce MFA for `admin`/`super_admin`, set short JWT expiry, configure SMTP with SPF/DKIM/DMARC, restrict redirect URLs.
6. **Provider verification** — Paymob HMAC field order and refund API, Daily token flow, Resend/Twilio/WhatsApp payloads are implemented from documentation but were **not** verified against live accounts.
7. **Rate limiting at the edge** — add WAF / bot protection (e.g. Vercel Firewall) for login, registration and contact endpoints in addition to database limits.
8. **Backups & retention** — enable PITR, define retention periods for documents and logs with counsel (see COMPLIANCE_CHECKLIST.md), and test restores.
9. **Penetration test** and dependency scanning (e.g. `npm audit`, Dependabot) before launch.
10. **Monitoring** — wire error tracking and alerting (failed webhooks, refund failures, cron failures).
