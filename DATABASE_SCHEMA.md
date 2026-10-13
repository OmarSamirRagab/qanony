# Database schema

Source of truth: `supabase/migrations/*.sql` (12 migrations). Generated TypeScript types: `src/types/database.ts` (`npm run db:types`). Reference data: `supabase/seed.sql`.

Conventions: UUID keys, `timestamptz` everywhere (display in Africa/Cairo), money as `bigint` piasters (`*_minor`), human references (`AP-2026-000123`, `PAY-…`, `INV-…`, `MT-…`, `SO-…`, `DP-…`, `TK-…`), `updated_at` triggers, RLS enabled on **every** table (85 tables, 156 policies). Helper functions live in the non-exposed `app` schema; callable RPCs live in `public` and are allow-listed with explicit `grant execute` (migration 0009 + later migrations).

## Migrations

| # | File | Contents |
|---|---|---|
| 1 | `foundation` | enums, `profiles`, `user_roles`, permissions, `user_settings`, `app.has_role/is_admin/has_permission/...`, profile guard |
| 2 | `reference_lawyers_firms` | governorates, cities, legal categories, consultation types, law firms (branches, departments, roles, members, member permissions), lawyer profiles (+private details, specialisations, credentials, verification requests, offices, offerings, availability, exceptions), favourites |
| 3 | `marketplace_booking` | legal services, packages, service orders (+transition guard), appointments (exclusion constraints), participants, events (append-only), notes, reschedules, `get_available_slots` |
| 4 | `matters_documents_messaging` | practice clients, legal matters (+members, events, tasks, hearings, notes, expenses), documents (+versions, matter links, grants, access log, templates), conversations/participants/messages/attachments, meeting sessions |
| 5 | `finance_subscriptions` | plans & features, subscriptions (+events), commission rules, invoices, payments, payment events, refunds, settlement accounts, settlements, payout requests, financial ledger |
| 6 | `operations` | platform settings, audit logs, notifications (+deliveries, preferences, templates), reviews (+reports), support tickets, disputes (+messages, evidence), CMS pages, articles, FAQs, banners, contact messages, rate limits, AI usage logs |
| 7 | `workflows_core` | auth trigger, `my_context`, admin role/status, verification, firms & invitations, booking/transition/reschedule/follow-up, expiry & reminders, matters, messaging, documents, service orders, reviews, disputes, contact |
| 8 | `workflows_finance` | payments pipeline, refunds, payouts, settlements, subscriptions, entitlements, notification queue, search, dashboards & reports |
| 9 | `storage_grants_realtime` | storage buckets, function grant allow-list, realtime publication |
| 10 | `profile_visibility` | `app.can_see_profile` — counterparties may see each other's names |
| 11 | `admin_and_invites` | invitee firm visibility, `admin_list_users`, `admin_set_firm_verification` |
| 12 | `admin_moderation_jobs` | `admin_moderate_service`, invoice-issued notification trigger, `claim_stale_uploads`, `admin_reject_payout`, `admin_beneficiary_balances` |

## Domains

### Identity & access
- `profiles` (1:1 `auth.users`): name, phone, locale, status (`active|suspended|pending_deletion|deleted`), consents. Readable by self, platform staff and counterparties (`app.can_see_profile`).
- `user_roles` (`client, lawyer, firm_owner, firm_staff, support, admin, super_admin`) — changed only via `admin_set_role` (administrative roles require super admin; no self-demotion).
- Platform permissions are role-derived (`app.has_permission`); support staff only get `users.view`, `appointments.view`, `support.tickets`.

### Lawyers & firms
- `lawyer_profiles` — public profile + booking rules. Trusted columns (`verification_status`, `is_published` before verification, `is_featured`, `sponsored_until`, ratings, listing cache) are guarded by trigger.
- `lawyer_private_details` (national ID, bar number etc.) — owner + admin only.
- `lawyer_credentials` + `lawyer_verification_requests` → `submit_lawyer_verification` / `review_lawyer_verification` (documented reason, audit, notification).
- `law_firms`, `law_firm_members` (`owner|lawyer|staff`, `invited|active|suspended|removed`), `law_firm_roles` + `law_firm_member_permissions` → `app.firm_has_permission(firm, perm)`. Seat and branch limits enforced from plan entitlements.

### Booking
- `lawyer_consultation_offerings` (type, duration, price), `lawyer_availability` (weekly, overlap trigger), `lawyer_availability_exceptions`.
- `appointments` — two `exclude using gist` constraints on `slot` (lawyer, client) for occupying statuses. State machine:

```
DRAFT → PENDING_PAYMENT → PENDING_CONFIRMATION → CONFIRMED → IN_PROGRESS → COMPLETED
          │                     │                    ├→ NO_SHOW ─→ DISPUTED/REFUNDED
          └→ EXPIRED ──(late payment re-validated)──┘ ├→ CANCELLED → REFUNDED
                                                      └→ DISPUTED → COMPLETED | REFUNDED | CANCELLED
```
  Mirrored in `src/lib/domain/status.ts`; enforced by `transition_appointment` (actor-specific rules, cancellation deadline, refund percentage from `app.appointment_refund_percent`).
- `appointment_events` append-only history; `appointment_reschedules` (limit from settings).

### Services
`legal_services` (lawyers submit for review; only admins activate/suspend; material edits to an active service return it to review), `service_packages`, `service_orders`:
`CREATED → PENDING_PAYMENT → PAID → IN_PROGRESS ⇄ WAITING_FOR_CLIENT → DELIVERED → COMPLETED` with `REVISION_REQUESTED`, `CANCELLED`, `DISPUTED`, `REFUNDED`; auto-completion after the review window.

### Practice management
`practice_clients`, `legal_matters` (`NEW → UNDER_REVIEW → ACTIVE → WAITING_* / ON_HOLD → COMPLETED → CLOSED → ARCHIVED`), `matter_members`, `matter_events`, `matter_tasks`, `matter_hearings`, `matter_notes` (`private|internal|shared`), `matter_expenses`. Visibility: owner lawyer, members, firm members with `matters.view_all`, and the client for client-shared items only.

### Documents
`documents` (+`document_versions` with storage path, sha256, scan status), `matter_documents` (`shared_with_client`), `document_access_grants`, `document_access_log` (append-only), `document_templates` (system templates flagged as drafts requiring legal review). Access is decided by `app.can_access_document` (owner, grants, firm permission, matter visibility, appointment/order party, conversation participant, dispute evidence, admin for credentials/evidence only). The `documents` storage bucket is private and has **no** storage policies — objects are reachable only through signed URLs minted after authorisation.

### Messaging
`conversations` (appointment, matter, order or support context), `conversation_participants` (read cursors), `messages`, `message_attachments`. Posting is checked by `app.can_post_to_conversation` (e.g. follow-up window after a consultation). Realtime publication: `messages`, `notifications`, `appointments`, `matter_events`, `conversation_participants` — subscribers only receive rows RLS lets them read.

### Finance
- `payments` — idempotency key, provider/mode, commission snapshot (`commission_rule_id`, `commission_rate_bps`, `commission_minor`), `gateway_fee_minor`, `net_minor`, `refunded_minor`.
- `payment_events` — append-only, unique `(provider, provider_event_id)`, `signature_valid`, redacted payload.
- `financial_ledger_entries` — append-only double entry (`account`: `gateway_clearing`, `platform_revenue`, `gateway_fees`, `gateway_fee_recovery`, `beneficiary_payable`, `settlement_payouts`, `subscription_revenue`), deferred constraint: each `transaction_id` balances.
- `refunds` (`requested → approved → processing → succeeded|failed|rejected`, retry with attempts), `settlement_accounts` (full identifier visible to owner/admin only — see SECURITY.md about Vault), `settlements`, `payout_requests`.
- `invoices` (issuer lawyer/firm, bill-to user or practice client, line items, totals; `issued` triggers a notification).
- `subscription_plans`, `plan_features` (key + limit), `subscriptions`, `subscription_events`; `app.effective_plan_*`, `my_entitlements`.

### Operations
`platform_settings` (JSON; some keys public; `integrations`/`security` keys super-admin only), `audit_logs` (append-only; row-change triggers on roles, settings, commission rules, plans), `notifications` (dedupe key) / `notification_deliveries` (queue with exponential back-off) / `notification_preferences` / `notification_templates`, `reviews` (one per completed service within 60 days; comments matching `app.review_flags` are held as `pending` for moderation, otherwise published), `review_reports`, `support_tickets` + messages, `disputes` + messages + evidence, `cms_pages`, `legal_articles` (sources, reviewed-by-lawyer flag), `faqs`, `banners`, `contact_messages`, `rate_limits` (`app.rate_limit` fixed window), `ai_usage_logs` (metadata only).

## Callable RPCs (public schema)

| Area | Functions |
|---|---|
| Context | `my_context`, `my_firm_permissions`, `my_entitlements`, `get_unread_counts` |
| Admin | `admin_list_users`, `admin_set_role`, `admin_set_account_status`, `admin_update_lawyer_status`, `admin_set_lawyer_placement`, `admin_set_firm_verification`, `admin_moderate_service`, `admin_create_refund`, `admin_create_settlement`, `admin_mark_settlement_paid`, `admin_reject_payout`, `admin_beneficiary_balances`, `admin_overview_stats`, `admin_report`, `review_lawyer_verification`, `moderate_review`, `resolve_dispute` |
| Account | `request_account_deletion`, `cancel_account_deletion`, `mark_notifications_read` |
| Lawyers/firms | `submit_lawyer_verification`, `create_law_firm`, `invite_firm_member`, `claim_firm_invitations`, `respond_firm_invitation`, `update_firm_member`, `set_primary_firm`, `search_lawyers`, `lawyer_dashboard_stats`, `lawyer_report`, `firm_report` |
| Booking | `get_available_slots`, `book_appointment`, `transition_appointment`, `reschedule_appointment`, `create_follow_up_appointment`, `create_matter_from_appointment` |
| Services | `create_service_order`, `transition_service_order` |
| Messaging | `open_matter_conversation`, `mark_conversation_read` |
| Documents | `create_document_upload`, `authorize_document_download`, `delete_document` (service role: `mark_document_uploaded`, `claim_stale_uploads`) |
| Payments | `create_payment`, `cancel_pending_payment`, `request_payout`, `start_subscription`, `cancel_subscription`, `resume_subscription` (service role: `attach_provider_order`, `record_payment_result`, `claim_refunds`, `complete_refund`) |
| Reviews/disputes | `submit_review`, `report_review`, `open_dispute`, `submit_contact_message` |
| Jobs (service role) | `expire_stale_appointments`, `queue_reminders`, `auto_complete_delivered_orders`, `process_subscription_renewals`, `claim_notification_deliveries`, `complete_notification_delivery` |

Errors are raised with SQLSTATE `42501` (forbidden), `22023` (validation, safe message), `P0001`/`P0002`, and machine-readable `HINT`s (`slot_unavailable`, `hold_expired`, `plan_limit`, `rate_limited`, …) mapped by `src/lib/errors.ts`.

## Seed data
27 governorates and major cities, 24 legal categories, consultation types, permissions, four plans (Basic, Professional, Law Firm, Enterprise) with features, a 15% global commission rule, platform settings, bilingual in-app notification templates, FAQs, three practical guides and seven document templates marked **draft — requires legal review**. The seed creates **no** lawyers, reviews, testimonials or users.
