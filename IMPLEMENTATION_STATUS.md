# Implementation status

_Last updated: 2026-10-13._ Legend: ✅ implemented & covered by automated tests · 🟢 implemented (UI/route; logic tested at DB level, page not E2E-tested) · 🟡 implemented, **not verified against the live provider** · 🧪 simulated (sandbox) · ⏳ pending / not implemented.

**Overall:** feature-complete for a **staging** deployment. **Not production-ready** — see "Blockers before production".

## Verification snapshot
| Check | Result (local, 2026-10-13) |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint | ✅ 0 errors · 3 warnings (`<img>` for user-uploaded media) |
| Vitest (unit + PGlite integration + RLS security) | ✅ 128 / 128 passed |
| `next build` | ✅ success |
| Playwright — public suite (system Chrome, desktop + mobile) | ✅ 32 passed · 2 skipped by design |
| Playwright — Supabase business flows | ⏭️ not executed (no Supabase project in this environment) |
| Real Supabase project (Auth, Storage API, Realtime) | ⏭️ not exercised — DB logic tested on PGlite with a Supabase shim |

## Modules

### Foundation
| Item | Status |
|---|---|
| Next.js 16 App Router, TS strict, Tailwind 4 design system (navy/gold, light/dark), Cairo/Amiri fonts | ✅ |
| Arabic default (RTL) + English (LTR), per-namespace catalogs, parity tests | ✅ |
| Supabase SSR clients, `proxy.ts` session refresh + auth redirect | ✅ |
| 12 migrations, RLS on all 85 tables, function grant allow-list, generated types | ✅ |
| Seed: reference data, plans, settings, templates (no fake people/reviews) | ✅ |
| Security headers / CSP, sitemap, robots, 404/error pages, loading states | ✅ |

### Public marketplace
| Item | Status |
|---|---|
| Home, lawyer search with filters & sorting, lawyer profile (JSON-LD), categories, governorates, firms, services, articles, FAQ, pricing, about, contact | 🟢 |
| Legal pages (privacy, terms, refund policy) — CMS-editable | 🟢 content is **draft**, needs counsel |
| Favourites | 🟢 |

### Authentication
| Item | Status |
|---|---|
| Client & lawyer registration, email confirmation callback, login, magic link, forgot/reset password, TOTP MFA, account deletion request | 🟢 (Supabase Auth not exercised in tests) |

### Booking & consultations
| Item | Status |
|---|---|
| Availability (weekly, exceptions, buffers, notice, caps), slot computation (TS↔SQL parity) | ✅ |
| Booking wizard, holds, double-booking prevention, confirmation, reschedule, cancel with refund policy, no-show, follow-up, ICS | ✅ DB · 🟢 UI |
| Video/voice room (Daily.co, private rooms, per-user tokens, join window) | 🟡 |
| Text consultations via messaging, written opinions | 🟢 |

### Payments & finance
| Item | Status |
|---|---|
| Payment pipeline: idempotency, signature verification, amount checks, commission snapshot, double-entry ledger, invoices | ✅ |
| Paymob Intention API adapter (checkout, HMAC callback, refunds) | 🟡 — signature logic unit-tested for self-consistency only |
| Sandbox gateway (HMAC-signed, labelled, same pipeline) | 🧪 ✅ |
| Refund queue + worker, settlements, payout requests/rejection, beneficiary balances | ✅ DB · 🟢 UI |
| Subscriptions (plans, entitlements, limits, renewals/grace/expiry) | ✅ DB · 🟢 UI · real recurring billing requires the gateway (renewal = new checkout) |
| Lawyer/firm invoices | ✅ DB · 🟢 UI |
| ETA e-invoicing / e-receipt integration | ⏳ |
| VAT calculation | ⏳ setting exists (0 bps); rules need tax advice |

### Dashboards
| Item | Status |
|---|---|
| Client portal: overview, appointments, messages, matters, orders, documents, payments, favourites, reviews, support, settings | 🟢 |
| Lawyer portal: overview & setup checklist, appointments, availability, messages, clients, matters, documents, templates, services, orders, finance, invoices, analytics, reviews, profile, verification, subscription, AI tools, settings | 🟢 |
| Firm portal: overview, calendar, appointments, matters, tasks, clients, documents, team & invitations, roles & permissions, branches, billing, finance, reports, profile, subscription, firm switcher | 🟢 (permissions ✅ in RLS tests) |
| Admin portal: overview, users, verification, firms, appointments, disputes, support & contact messages, services moderation, reviews, content (articles/FAQs/legal pages), categories, payments & events, refunds, settlements & payouts, commissions, plans & subscriptions, reports (+CSV), settings, integrations status, audit log | 🟢 (admin RPCs ✅) |

### Communication & legal operations
| Item | Status |
|---|---|
| Realtime messaging with attachments, read state, follow-up window | 🟢 (RLS ✅; Realtime delivery not tested) |
| In-app notifications (realtime bell, templates ar/en, dedupe, preferences) | ✅ DB · 🟢 UI |
| Email (Resend), SMS (Twilio), WhatsApp (Meta Cloud) delivery worker with retries; unconfigured channels recorded as `skipped` | 🟡 (adapters unit-tested with mocked HTTP) |
| Matters, tasks, hearings (+reminders), notes visibility, expenses, matter documents, templates with placeholders | ✅ DB · 🟢 UI |
| Documents: signed upload, magic-byte check, sha256, versions, grants, access log, authorised download, stale-upload cleanup | ✅ |
| Malware scanning (ClamAV REST) | 🟡 optional |
| Service orders (deliver, revisions, auto-complete), reviews (flags, moderation, responses), disputes (evidence, resolution with refunds), support tickets | ✅ DB · 🟢 UI |

### Advanced
| Item | Status |
|---|---|
| AI assistant (public legal information) and lawyer AI tools via Claude (`claude-opus-5-5`), consent, per-document opt-in, limits, disclaimers | 🟡 (no API key available to test) |
| Scheduled jobs (`/api/cron/*`, 7 jobs) + `vercel.json` | ✅ auth & job SQL tested · 🟡 scheduler itself not exercised |
| SEO: metadata, hreflang alternates, JSON-LD, sitemap, robots | ✅ |
| Banners (table exists, no admin UI or rendering) | ⏳ |
| Notification template editor (templates managed by SQL/seed) | ⏳ |
| Data export for users; automated erasure/retention purge | ⏳ manual process |

## Blockers before production
1. **Regulatory decisions** (COMPLIANCE_CHECKLIST.md): commission vs. Bar fee-sharing rules, funds-flow model with the CBE/PSP, PDPL licensing & cross-border transfers, ETA e-invoicing, VAT.
2. **Legal texts**: privacy policy, terms, refund policy, seeded guides and 7 document templates are drafts.
3. **Provider verification**: Paymob (test → live), Daily, Anthropic, Resend/Twilio/WhatsApp, ClamAV — run the checks in DEPLOYMENT.md.
4. **Security hardening** (SECURITY.md): nonce-based CSP, encryption of bank/identity fields, mandatory malware scanning, admin MFA enforcement, edge rate limiting, penetration test.
5. **Run the Supabase-backed E2E flows** and fix any selector/environment issues; add accessibility (axe) checks.
6. **Operations**: backups/PITR and restore test, monitoring/alerting, a scheduler that supports the 2–10 minute cron cadence.

## Assumptions made
- Single country (Egypt), currency EGP, timezone Africa/Cairo; Arabic is the default language.
- Lawyers set their own prices; the platform commission defaults to 15% (configurable, can be 0%).
- Client cancellation: full refund before the lawyer's deadline, 50% after (configurable), none after start; lawyer/admin cancellation always refunds in full.
- Gateway fees are borne by the platform by default (`payments.gateway_fee_bearer`).
- Reviews are allowed only from clients with a completed service, within 60 days; comments with contact details/case numbers are held for moderation.
- Contingency fees are not offered.
