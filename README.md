# Qanony — قانوني

Legal services marketplace and law-practice management platform for Egypt. Arabic-first (RTL) with English (LTR), EGP pricing, Africa/Cairo time.

Clients find verified lawyers, book video / voice / text / in-person consultations or fixed-price legal services, pay online and follow their matters, documents and messages in one place. Lawyers and law firms get a public profile, calendar, client & matter management, invoicing, earnings and subscriptions. Platform staff verify lawyers, moderate the marketplace, resolve disputes and run finance.

> **Status:** feature-complete for a staging launch, **not production-ready**. Payment, video, AI, email/SMS/WhatsApp integrations are implemented but have not been verified against live provider accounts, and legal texts require review by Egyptian counsel. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and [COMPLIANCE_CHECKLIST.md](COMPLIANCE_CHECKLIST.md).

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, TypeScript (strict) |
| UI | Tailwind CSS 4, Radix primitives, Lucide icons, Sonner, Recharts |
| i18n | next-intl 4 — Arabic default at `/`, English at `/en` |
| Data / forms | TanStack Query, React Hook Form, Zod 4, Zustand |
| Backend | Supabase — Postgres (RLS everywhere), Auth, Storage, Realtime |
| Integrations | Paymob (payments), Daily.co (video), Anthropic Claude (AI), Resend / Twilio / WhatsApp Cloud (notifications), optional ClamAV |
| Tests | Vitest (+ PGlite in-process Postgres for DB/RLS tests), Playwright |

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in Supabase keys at minimum
# Apply database migrations and seed (Supabase CLI):
supabase db push                  # or: supabase db reset (local)
psql "$DATABASE_URL" -f supabase/seed.sql
npm run dev                       # http://localhost:3000
```

Without Supabase variables the public site still renders and shows a clear "not configured" notice; all authenticated areas redirect to login.

For local payments without a gateway set `PAYMENTS_SANDBOX_ENABLED=true` and a `PAYMENTS_SANDBOX_SECRET`. Sandbox payments are labelled everywhere and never move money.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | All Vitest suites (unit + DB integration + RLS security) |
| `npm run test:unit` / `test:db` | Subsets |
| `npm run test:e2e` | Playwright (run `npm run build` first) |
| `npm run db:types` | Regenerate `src/types/database.ts` from the migrations |

## Repository layout

```
messages/{ar,en}/*.json      UI copy, one file per namespace
supabase/migrations/         schema, RLS, RPCs (source of truth for business rules)
supabase/seed.sql            reference data only (no fake lawyers or reviews)
src/app/[locale]/(public)    marketplace, content, booking, checkout
src/app/[locale]/(auth)      login, registration, password reset
src/app/[locale]/(app)       client / lawyer / firm / admin portals + shared account pages
src/app/api                  uploads, downloads, webhooks, ICS, meetings, reports, cron
src/features/*               feature modules (actions, queries, components)
src/lib                      domain logic, Supabase clients, providers, jobs
tests/                       unit, integration (PGlite), security, e2e
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and request flows
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — tables, state machines, RPCs
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — HTTP routes, server actions, webhooks
- [SECURITY.md](SECURITY.md) — threat model and controls
- [DEPLOYMENT.md](DEPLOYMENT.md) — environments, provider setup, go-live checklist
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- [TESTING.md](TESTING.md)
- [COMPLIANCE_CHECKLIST.md](COMPLIANCE_CHECKLIST.md) — items for Egyptian legal/regulatory review
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — what is done, simulated or pending
