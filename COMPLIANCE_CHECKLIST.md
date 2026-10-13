# Compliance checklist — for review by Egyptian counsel

This is an engineering checklist, **not legal advice**. It lists the questions the platform raises under Egyptian law and the place in the product where each is handled, so that a qualified Egyptian lawyer can confirm, amend or reject each item. Statute references are given only to orient the reviewer and must be verified by counsel; no article numbers or legal conclusions have been assumed in the code.

Status legend: ☐ needs counsel decision · ◐ implemented technically, needs legal confirmation · ☑ confirmed (fill in after review)

## 1. Practice of law & the Bar (Advocacy Law No. 17 of 1983 and Bar Association rules — verify current text)
| # | Question | Where in product | Status |
|---|---|---|---|
| 1.1 | May a non-lawyer company operate a marketplace connecting clients with lawyers? Any licence or Bar notification required? | Whole platform | ☐ |
| 1.2 | Is a **percentage commission on consultation/service fees** permissible, or does it amount to fee-sharing with a non-lawyer? Alternatives: flat listing/subscription fee only, booking fee charged to the client, or a technology fee. | `commission_rules`, Admin → Commissions (rate configurable, can be set to 0%) | ☐ |
| 1.3 | Rules on lawyer advertising and solicitation: are profiles, ratings, "featured" (editorial) and "sponsored" (paid, labelled) placements permitted? Required wording? | Lawyer profile, search ranking, `is_featured`, `sponsored_until` | ☐ |
| 1.4 | Are public client reviews of lawyers permitted? Moderation duties? | Reviews (verified-client only, automatic flagging of contact details/case numbers, moderation) | ◐ |
| 1.5 | Verification standard: which documents prove active Bar registration and grade (`general`, `primary`, `appeal`, `cassation`)? Re-verification frequency? | Lawyer verification workflow, credential expiry dates | ◐ |
| 1.6 | Law firms: requirements for firm entities, partnerships and display of firm registration. | Firm profile, `commercial_registration` (private) | ☐ |
| 1.7 | Fixed-price "legal services" catalogue (e.g. contract review): allowed as published fixed fees? Disclosure requirements? | Services marketplace | ☐ |
| 1.8 | Contingency fees are blocked in the product (`contingency_not_allowed` billing type). Confirm this is the correct position. | Matter billing types | ◐ |
| 1.9 | Lawyer–client relationship formation: when does it start (booking, payment, confirmation)? Conflict-check obligations for firms? | Booking flow, matters | ☐ |

## 2. Personal data (Personal Data Protection Law No. 151 of 2020 and its executive regulations — verify status)
| # | Question | Where in product | Status |
|---|---|---|---|
| 2.1 | Registration/licensing with the Personal Data Protection Center (controller/processor licences), DPO appointment. | Organisational | ☐ |
| 2.2 | Legal-matter data and identity documents are likely **sensitive data** — required consent form and safeguards. | Booking issue summaries, matters, documents, `lawyer_private_details` | ◐ consent at registration; per-document AI opt-in |
| 2.3 | Cross-border transfer: Supabase region, Vercel, Daily.co, Anthropic, Resend, Twilio, Meta are outside Egypt. Permitted transfer basis? Need for local hosting? | Infrastructure | ☐ |
| 2.4 | Data subject rights: access, correction, deletion. Users can request deletion (account becomes `pending_deletion`, cancellable) and edit their profile; **actual erasure/anonymisation and data export are manual admin processes today** — no automated purge. | Settings → Account | ◐ |
| 2.5 | Retention periods for matter files, documents, messages, invoices, audit logs, payment records (also tax and Bar record-keeping duties). | `retention_until` column exists; no automatic purge yet | ☐ |
| 2.6 | Breach notification procedure and timelines. | Organisational / SECURITY.md | ☐ |
| 2.7 | Privacy policy text (current page is a **draft** placeholder). | Admin → Content → Legal pages | ☐ |
| 2.8 | Marketing consent is separate and opt-in. | Registration, settings | ◐ |
| 2.9 | Staff access to client data limited (support cannot read messages/documents; admins see credential documents and dispute evidence only). Is this sufficient? | RLS, SECURITY.md | ◐ |

## 3. AI features
| # | Question | Where | Status |
|---|---|---|---|
| 3.1 | Is the public "legal information" assistant permissible, given it is not provided by a lawyer? Required disclaimers (present on every answer). | `/assistant` | ◐ |
| 3.2 | Lawyers' use of AI on client documents: client consent requirements; professional secrecy implications of sending documents to an overseas processor. | Lawyer AI tools, per-document `ai_processing_allowed` | ◐ |
| 3.3 | Content generated must not invent statutes or case law — the system prompts forbid it; lawyer remains responsible. Is additional labelling needed? | `src/features/ai/prompts.ts` | ◐ |

## 4. Consumer protection & e-commerce (Consumer Protection Law No. 181 of 2018; e-signature Law No. 15 of 2004 — verify)
| # | Question | Where | Status |
|---|---|---|---|
| 4.1 | Pre-contract information: price in EGP incl. taxes, lawyer identity, cancellation and refund policy shown before payment. | Booking summary step, refund policy page (**draft**) | ◐ |
| 4.2 | Cancellation / refund rules: 100% before the lawyer's deadline, configurable percentage after (default 50%), 0% after start; lawyer cancellation = 100%. Confirm compliance with consumer withdrawal rights. | `refund_policy` setting, `appointmentRefundPercent` | ☐ |
| 4.3 | Terms & Conditions acceptance by checkbox with timestamp — sufficient as electronic consent? | Registration (`terms_accepted_at`) | ◐ |
| 4.4 | Complaints handling and dispute resolution timelines. | Support tickets, disputes | ◐ |
| 4.5 | Terms of service text (**draft**). | Admin → Content | ☐ |

## 5. Payments & funds flow (Central Bank and Banking Sector Law No. 194 of 2020 and CBE payment regulations — verify)
| # | Question | Where | Status |
|---|---|---|---|
| 5.1 | Can the platform collect client funds and pay lawyers later (marketplace / escrow-like holding), or must this be done by a licensed PSP with split settlement? | Ledger, settlements, payouts | ☐ **critical** |
| 5.2 | Payout methods (bank transfer, InstaPay, mobile wallets) — KYC obligations for lawyers receiving funds. | Settlement accounts | ☐ |
| 5.3 | Storage of bank account identifiers (currently RLS-protected, not encrypted — see SECURITY.md). | `settlement_accounts` | ☐ |
| 5.4 | Chargebacks and disputed card payments: allocation between platform and lawyer. | Disputes, refunds | ☐ |

## 6. Tax & invoicing (VAT Law No. 67 of 2016; ETA e-invoice / e-receipt systems — verify)
| # | Question | Where | Status |
|---|---|---|---|
| 6.1 | VAT on platform commission and subscriptions; VAT treatment of legal services invoiced by lawyers through the platform. | `tax.vat_bps` setting (currently 0) | ☐ |
| 6.2 | Mandatory **e-invoicing / e-receipt** integration with the Egyptian Tax Authority for platform and/or lawyer invoices. **Not integrated.** | Invoices | ☐ **critical** |
| 6.3 | Withholding tax on payouts to lawyers. | Settlements | ☐ |
| 6.4 | Invoice numbering/format requirements. | `INV-YYYY-NNNNNN` | ☐ |

## 7. Electronic communications & records
| # | Question | Where | Status |
|---|---|---|---|
| 7.1 | Evidential value of in-platform messages and uploaded documents; integrity (sha256 per version, access log). | Documents, messages | ◐ |
| 7.2 | The platform does not enable recording for consultations (Daily rooms/tokens are created without recording). Confirm no recording without explicit two-party consent, and keep recording disabled at the Daily domain level. | Video room | ◐ |
| 7.3 | SMS/WhatsApp marketing rules (NTRA); transactional-only today. | Notifications | ☐ |
| 7.4 | Anti-Cybercrime Law No. 175 of 2018 — data retention or cooperation duties for platform operators. | Organisational | ☐ |

## 8. Content
| # | Question | Where | Status |
|---|---|---|---|
| 8.1 | Legal articles and guides: reviewed-by-lawyer flag and source list exist; the three seeded guides are general information and must be reviewed. | Articles | ☐ |
| 8.2 | Seven seeded document templates are marked **DRAFT — requires legal review** and must be approved or removed. | Document templates | ☐ |
| 8.3 | No fabricated lawyers, reviews or testimonials exist in seed data. | `supabase/seed.sql` | ☑ (engineering) |

## Sign-off
| Area | Reviewer | Date | Decision / notes |
|---|---|---|---|
| Bar / practice rules | | | |
| Data protection | | | |
| Consumer / e-commerce | | | |
| Payments / CBE | | | |
| Tax / e-invoicing | | | |
