# Testing

## Suites

| Suite | Command | What it covers | Needs |
|---|---|---|---|
| Unit | `npm run test:unit` | money, commission resolution, refund policy, status machines, availability, entitlements, permissions, review flags, invoices; i18n catalog parity (keys + placeholders, no dotted keys); payment signature verification (sandbox, Paymob self-consistency), notification adapters, cron authorisation | nothing |
| DB integration | `npm run test:db` | every migration on a real Postgres (PGlite + `btree_gist`) with a Supabase auth/storage shim: booking & double-booking, holds/expiry, reschedule, payments pipeline (idempotency, signature, amount mismatch, late payment, refunds, ledger balance), settlements, subscriptions & entitlements, service orders, reviews, disputes, notifications, search, reports, admin moderation & jobs, TS↔SQL slot parity | nothing |
| Security | (part of `test:db`) | RLS: cross-tenant reads/writes, privilege escalation guards, staff limits, document access rules, profile visibility, admin directory, function grant allow-list | nothing |
| E2E (public) | `npm run build && npm run test:e2e -- tests/e2e/public.spec.ts` | locale/RTL, language switch, mobile menu, auth redirects for all portals, localised 404, security headers, robots/sitemap, login validation, footer legal links, cron/webhook rejection — desktop and mobile viewports | a built app; Chrome (bundled or `E2E_BROWSER_CHANNEL=chrome`) |
| E2E (flows) | `E2E_SUPABASE=1 npm run test:e2e -- tests/e2e/flows.spec.ts` | sign-in, search → profile, book & pay via sandbox (success and decline), lawyer sees booking, client blocked from admin, admin overview/integrations | a Supabase test project + accounts (below) |

`npm test` runs unit + integration + security.

### How DB tests work
`tests/helpers/db.ts` boots PGlite, applies `tests/helpers/supabase-shim.sql` (roles `anon`/`authenticated`/`service_role`, `auth.uid()`, `auth.users`, storage schema) and then every file in `supabase/migrations` in order, plus the seed. Tests switch roles with `set local role` and JWT claims, so RLS and grants are exercised exactly as in Supabase. This does **not** test Supabase-specific services (GoTrue, Storage API, Realtime).

## Last verified run (2026-10-13, local, Windows)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ no errors |
| `npm run lint` | ✅ 0 errors, 3 warnings (`<img>` for user-uploaded avatars/logos) |
| `npm test` (Vitest) | ✅ **128 / 128 passed** — unit 48, integration 55, security 25 |
| `npm run build` | ✅ success; all `(app)` routes dynamic |
| Playwright `public.spec.ts` (system Chrome) | ✅ **32 passed, 2 skipped by design** (desktop-only / mobile-only case) |
| Playwright `flows.spec.ts` | ⏭️ **not executed** — no Supabase project available in this environment (7 tests skip) |

Per file: admin 6, availability-parity 1, booking 16, jobs 3, migrations 2, payments 13, workflows 14, rls 25, domain 20, i18n 17, providers 11.

## Running the flow tests
1. Supabase test project with migrations + seed (see DEPLOYMENT.md), app env pointing to it, `PAYMENTS_SANDBOX_ENABLED=true`, `PAYMENTS_SANDBOX_SECRET` set.
2. Create accounts and data:
   - a client (`E2E_CLIENT_EMAIL`/`E2E_CLIENT_PASSWORD`),
   - a lawyer, verified and published by an admin, with weekly availability and a paid **video** offering (`E2E_LAWYER_EMAIL`/`E2E_LAWYER_PASSWORD`/`E2E_LAWYER_SLUG`),
   - an admin (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).
3. `npm run build && E2E_SUPABASE=1 npm run test:e2e -- tests/e2e/flows.spec.ts`

Because these flows have not yet been run against a live project, expect to adjust selectors on the first run.

## Coverage of the specified critical flows

| # | Flow | Automated coverage |
|---|---|---|
| 1 | Client registration & login | E2E login validation; flow sign-in (needs Supabase); the `handle_new_user` signup trigger runs for every user created in DB tests |
| 2 | Lawyer registration & verification | DB: submit/review verification, guards against self-verification and publishing before verification |
| 3 | Search & filter lawyers | DB: `search_lawyers`; E2E flow: search → profile |
| 4 | Book paid consultation | DB: booking, holds, double-booking, min-notice, daily caps; E2E flow with sandbox |
| 5 | Payment success / failure / webhook replay | DB: payments suite; unit: signature verification; E2E flow success + decline |
| 6 | Lawyer confirms / completes / no-show | unit: transition rules; DB: completion and no-show timing/actor checks |
| 7 | Cancellation & refund policy | unit: refund policy; DB: refunds + ledger reversal |
| 8 | Reschedule | DB: reschedule limits and slot checks |
| 9 | Video consultation join window | unit: `canJoinMeeting`; provider not exercised (no Daily key) |
| 10 | Messaging & documents access | security: conversation and document RLS; DB: upload authorisation & stale-upload cleanup |
| 11 | Matters, tasks, hearings | DB: matter creation, visibility rules |
| 12 | Service orders lifecycle | DB: full lifecycle incl. revision limit; auto-complete job after the review window |
| 13 | Reviews & moderation | DB: one review per service, flags, moderation; admin page |
| 14 | Disputes & resolution with refund | DB: open/resolve with refund |
| 15 | Admin: roles, verification, settlements, commissions | DB: admin RPCs, role guards, settlements, payout rejection, beneficiary balances |

Not automated yet: visual regression, accessibility audits (axe), load tests, Realtime delivery, real provider sandboxes (Paymob test mode, Daily, Resend/Twilio/WhatsApp).
