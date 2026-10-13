# Deployment

Target: **Vercel** (Next.js) + **Supabase** (managed Postgres/Auth/Storage/Realtime). Other Node hosts work if they run `next build && next start` and an external scheduler calls the cron endpoints.

## 1. Supabase project
1. Create a project in a region close to Egypt (e.g. `eu-central-1`). Enable Point-in-Time Recovery on production.
2. Apply migrations in order:
   ```bash
   supabase link --project-ref <ref>
   supabase db push            # applies supabase/migrations/*
   psql "$DATABASE_URL" -f supabase/seed.sql   # reference data, idempotent
   ```
3. Storage: migration 0009 creates the private `documents` bucket (no policies — access only via signed URLs) and `public-media` for avatars/logos.
4. Realtime: migration 0009 adds the needed tables to `supabase_realtime`.
5. Auth settings:
   - Site URL = `NEXT_PUBLIC_SITE_URL`; redirect allow-list: `${SITE_URL}/auth/callback`, `${SITE_URL}/en/...` equivalents.
   - Email confirmation on; custom SMTP with SPF/DKIM/DMARC; Arabic + English email templates linking to `/auth/callback?token_hash={{ .TokenHash }}&type=...`.
   - Enable TOTP MFA; enable leaked-password protection.
6. Create the first super admin: sign up normally, then in SQL:
   ```sql
   insert into public.user_roles (user_id, role) values ('<uuid>', 'super_admin');
   ```
   (All later role changes go through the admin UI / `admin_set_role`.)

## 2. Vercel project
1. Import the repository, framework preset Next.js, Node 20+.
2. Set environment variables (ENVIRONMENT_VARIABLES.md) for Production and Preview separately. Preview should use a separate Supabase project and the sandbox gateway.
3. `vercel.json` registers cron jobs; set `CRON_SECRET` so Vercel sends `Authorization: Bearer <secret>`. Note: Vercel Hobby only allows daily cron — the 2–10 minute schedules need a Pro plan or an external scheduler (GitHub Actions, Supabase `pg_cron` + `pg_net`, etc.) calling the same URLs.
4. Domains: set the production domain and update `NEXT_PUBLIC_SITE_URL`. `robots.txt` blocks indexing on non-production Vercel environments automatically.

## 3. Payment gateway (Paymob)
Implemented against Paymob's public Intention API documentation; **not yet verified against a live account**. Before enabling:
1. Create test integrations (card, wallet) and set `PAYMOB_*` with `PAYMOB_MODE=test`.
2. In the Paymob dashboard set the transaction processed callback to `https://<domain>/api/payments/paymob/webhook` and the response callback to `https://<domain>/api/payments/return/paymob`.
3. Run test payments: success, decline, 3-DS, wallet; confirm `payment_events.signature_valid = true` and that the appointment/order is fulfilled; test a partial and a full refund from **Admin → Payments**, then run the `refunds` job.
4. Confirm the HMAC field list and `special_reference` ↔ `merchant_order_id` mapping on real callbacks; adjust `src/lib/providers/payments/paymob.ts` if Paymob's payload differs.
5. Settle the regulatory model (marketplace collection vs. split payments / payment facilitator) with the gateway and counsel before switching `PAYMOB_MODE=live`.

## 4. Other providers
| Provider | Setup | Verify |
|---|---|---|
| Daily.co | create API key → `DAILY_API_KEY`; enable EU/ME data region if available | join a test consultation as client and lawyer within the window; confirm tokens expire |
| Anthropic | `ANTHROPIC_API_KEY`; optionally `AI_MODEL` | ask the public assistant; run a lawyer tool on a document with AI processing enabled |
| Resend | verify sending domain; `RESEND_API_KEY`, `EMAIL_FROM` | trigger a booking; run the `notifications` job; check delivery status in **Admin → Integrations** / `notification_deliveries` |
| Twilio | buy/register an Egyptian-capable sender; `TWILIO_*` | as above |
| WhatsApp Cloud | approve a utility template with two body params in `ar` and `en`; `WHATSAPP_*` | as above |
| ClamAV | deploy a ClamAV REST service; `CLAMAV_SCAN_URL` (+ token) | upload the EICAR test file → must be rejected as infected |

## 5. Go-live checklist
- [ ] All migrations applied; `npm run db:types` produces no diff.
- [ ] `PAYMENTS_SANDBOX_ENABLED` **unset/false** in production.
- [ ] Super admin created with MFA; staff accounts reviewed.
- [ ] Paymob verified end-to-end in test mode, then live with a small real transaction and refund.
- [ ] Cron jobs running (check responses / logs); notification deliveries leaving `queued`.
- [ ] Legal pages (privacy, terms, refund policy) replaced with counsel-approved text in **Admin → Content → Legal pages**; document templates reviewed.
- [ ] Backups/PITR enabled; restore tested.
- [ ] SECURITY.md hardening items addressed or accepted in writing.
- [ ] COMPLIANCE_CHECKLIST.md reviewed by Egyptian counsel.
- [ ] Monitoring/alerting configured (errors, webhook failures, refund failures, job failures).

## Rollback
Deployments are immutable on Vercel — promote the previous deployment. Database migrations are forward-only; write a new corrective migration rather than editing applied ones. Take a backup before every production migration.
