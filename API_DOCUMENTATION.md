# API documentation

Qanony has no public REST API. The browser talks to:

1. **Supabase directly** (anon key + user JWT) for reads allowed by RLS and for Realtime.
2. **Next.js Server Actions** (`src/features/*/actions.ts`) for mutations.
3. **Route handlers** (`src/app/api/*`, `src/app/auth/callback`) where a URL is required (uploads, downloads, webhooks, calendar files, meeting tokens, CSV, cron).

All JSON errors use `{ ok: false, error: ErrorKey, detail? }` with keys from `messages/*/errors.json`. Responses are `Cache-Control: no-store`.

## Route handlers

### Documents
| Method & path | Auth | Body / query | Response |
|---|---|---|---|
| `POST /api/documents/upload` | session cookie, same-origin | `{ title, category, filename, mime, size, matterId?, appointmentId?, serviceOrderId?, firmId?, documentId? (new version), shareWithClient? }` | `{ ok, documentId, version, path, token, bucket }` — signed upload token for exactly that path. 422 `invalidFile` (type/size), 401, 403, 429 `rateLimited` (60 uploads/hour).

Other database rate limits: bookings 10/hour, service orders 10/hour, contact form 3/hour per email, AI requests per user (see `src/features/ai/actions.ts`). |
| `POST /api/documents/{id}/finalize` | session, same-origin, uploader only | `{ version }` | Verifies size, magic bytes vs. declared MIME, computes sha256, scans if `CLAMAV_SCAN_URL` is set. `{ ok, scan }` or 422 `invalidFile` / `infected`. |
| `GET /api/documents/{id}/download?version=&inline=1` | session | — | 302 to a 60-second signed URL after `authorize_document_download` (access logged). 404 if not permitted (no existence leak). |

Allowed types: PDF, JPEG, PNG, WebP, DOC, DOCX, TXT; max 25 MB (settings `uploads`).

### Payments
| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/payments/{provider}/webhook` | provider signature | `provider` ∈ `paymob`, `sandbox`. Paymob: HMAC-SHA512 of the documented field list, passed as `?hmac=`. Sandbox: HMAC-SHA256 in `x-sandbox-signature`. Unsigned/invalid events are recorded with `signature_valid=false` and never fulfil anything. Idempotent per `(provider, event id)`. Returns `{ ok, result }` with one of `captured`, `captured_refund_required` (paid after the slot was lost — refund queued), `duplicate`, `invalid_signature`, `unknown_payment`, `already_captured`, `failed`, `amount_mismatch`, `ignored`. 404 if the provider is not configured. |
| `GET /api/payments/return/paymob` | none | Browser return URL. Never trusted for state — redirects to `/checkout/result?ref=…`, which reads the database (status comes only from the webhook). |

### Consultations & calendar
| Method & path | Auth | Response |
|---|---|---|
| `POST /api/meetings/{appointmentId}/join` | session, same-origin, participant | `{ ok, url, token, audioOnly, endsAt }` — private Daily room + per-user meeting token, valid only inside the join window (10 min before start → 30 min after end). 503 `notConfigured` when `DAILY_API_KEY` is absent. |
| `GET /api/appointments/{id}/ics` | session, participant | `text/calendar` file (no issue summary included). |

### Reports
`GET /api/reports/{lawyer|firm|admin}?from=YYYY-MM-DD&to=YYYY-MM-DD[&firm=uuid]` — CSV (UTF-8 BOM, formula-injection-safe). Authorised by the underlying RPC (`lawyer_report`, `firm_report` with `reports.view`, `admin_report` admin only).

### Scheduled jobs
`GET|POST /api/cron/{job}` with `Authorization: Bearer $CRON_SECRET` (≥16 chars, constant-time compare). Jobs: `expire-appointments`, `reminders`, `notifications`, `refunds`, `complete-orders`, `subscriptions`, `cleanup-uploads`. Response `{ ok, job, ms, result }`. 503 when `CRON_SECRET` is unset, 401 on bad token, 404 unknown job. Schedule: `vercel.json`.

### Auth
`GET /auth/callback?code=…` or `?token_hash=…&type=…&next=/path` — exchanges the Supabase code / verifies the OTP, then redirects to a same-site `next` path only (`safeNextPath`).

### SEO
`/sitemap.xml` (public, verified lawyers/firms, published articles, active services, categories, governorates; ar + en alternates) and `/robots.txt` (blocks portals and APIs; blocks everything on non-production Vercel deployments).

## Server actions (by module)

All actions validate with zod, run as the signed-in user, and return `ActionResult<T>`.

| Module | Actions |
|---|---|
| `auth` | sign in (incl. MFA), register client / lawyer, magic link, forgot / reset password, sign out |
| `lawyers` | toggle favourite |
| `booking` | book appointment, transition (confirm / start / complete / no-show / cancel with refund), reschedule, follow-up, notes |
| `payments` | start checkout (appointment, order, invoice, subscription), sandbox completion (sandbox only), cancel pending |
| `documents` | rename/category, share/grant, AI-processing toggle, delete |
| `matters` | create from appointment / manually, update, status, members, tasks, hearings, notes, expenses, template fill |
| `messaging` | send message (with attachments), mark read, open matter conversation |
| `orders` | create order, transition, deliver, request revision |
| `reviews` | submit, report, lawyer response, moderate (admin) |
| `disputes` | open, post message, add evidence, resolve (admin) |
| `support` | open ticket, reply, set status (staff) |
| `settings` | profile, locale, notification preferences, password, MFA enrol/remove, account deletion request/cancel |
| `firms` | create firm, invite / update / remove member, respond to invitation, roles & permissions, branches, profile, switch firm |
| `lawyer-portal` | profile, offerings, availability & exceptions, verification submission & credentials, publish toggle, services, practice clients, invoices, payout request, settlement account, subscription start/cancel/resume |
| `ai` | ask assistant (public), lawyer tools (summarise, draft, document Q&A) |
| `content` | contact form |
| `admin` | user roles & status, verification decisions, lawyer status & placement, firm verification, service moderation, refunds, settlements, payouts, commission rules, plans & features, articles, FAQs, CMS pages, categories, contact messages, platform settings |

## Realtime channels
Clients subscribe to Postgres changes on `messages` (per conversation), `notifications` (own), `appointments`, `matter_events`, `conversation_participants`. RLS filters every payload.

## Provider adapters (server-side)
| Interface | Implementation | File |
|---|---|---|
| `PaymentProvider` (`createCheckout`, `parseWebhook`, `refund`) | Paymob Intention API; HMAC sandbox | `src/lib/providers/payments/*` |
| Video | Daily.co REST (rooms, meeting tokens) | `src/lib/providers/video/daily.ts` |
| AI | Anthropic SDK, `claude-opus-5-5`, streaming + `finalMessage()` | `src/lib/providers/ai/anthropic.ts` |
| Notifications | Resend, Twilio, WhatsApp Cloud API | `src/lib/providers/notify/index.ts` |
| Scanner | ClamAV REST wrapper (optional) | `src/lib/providers/scanner.ts` |
