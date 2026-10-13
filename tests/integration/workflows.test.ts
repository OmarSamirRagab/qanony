import { beforeAll, describe, expect, it } from 'vitest'
import { createPublishedLawyer, createTestDb, createUser, fails, idem, nextSlot, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string
let admin: string

const issue = 'أحتاج استشارة حول إنهاء عقد العمل والحصول على المستحقات.'

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createPublishedLawyer(db)
  await db.query(
    `insert into public.subscriptions (plan_id, lawyer_id, status, current_period_end)
     select id, $1, 'active', now() + interval '30 days' from public.subscription_plans where code = 'professional'`, [lawyer])
  admin = await createUser(db, { roles: ['admin'] })
})

async function completedAppointment(client: string, day: number) {
  const slot = await nextSlot(db, lawyer, 'text', day)
  const [a] = await q<{ id: string }>(db, { id: client }, `select public.book_appointment($1, 'text', $2::timestamptz, $3) as id`, [lawyer, slot, issue])
  await db.query(`update public.appointments set starts_at = now() - interval '40 minutes', ends_at = now() - interval '10 minutes' where id = $1`, [a!.id])
  await q(db, { id: lawyer }, `select public.transition_appointment($1, 'COMPLETED')`, [a!.id])
  return a!.id
}

describe('reviews', () => {
  it('only allows one review per completed service, updates rating aggregates', async () => {
    const client = await createUser(db)
    const appt = await completedAppointment(client, 2)
    await q(db, { id: client }, `select public.submit_review($1, null, 5, 'شرح واضح ومفيد جدًا')`, [appt])
    expect(await fails(db, { id: client }, `select public.submit_review($1, null, 4, 'again')`, [appt])).toMatch(/already reviewed/)
    const [l] = await q<{ rating_avg: string; rating_count: number }>(db, 'anon', `select rating_avg, rating_count from public.lawyer_profiles where id = $1`, [lawyer])
    expect(Number(l!.rating_avg)).toBe(5)
    expect(l!.rating_count).toBe(1)
    const pub = await q(db, 'anon', `select id from public.reviews where lawyer_id = $1 and status = 'published'`, [lawyer])
    expect(pub).toHaveLength(1)
  })

  it('rejects reviews from clients without a completed service', async () => {
    const stranger = await createUser(db)
    const client = await createUser(db)
    const slot = await nextSlot(db, lawyer, 'text', 3)
    const [a] = await q<{ id: string }>(db, { id: client }, `select public.book_appointment($1, 'text', $2::timestamptz, $3) as id`, [lawyer, slot, issue])
    expect(await fails(db, { id: client }, `select public.submit_review($1, null, 1, 'x')`, [a!.id])).toMatch(/completed/)
    expect(await fails(db, { id: stranger }, `select public.submit_review($1, null, 1, 'x')`, [a!.id])).toMatch(/completed/)
    expect(await fails(db, { id: stranger }, `insert into public.reviews (lawyer_id, client_id, appointment_id, rating) values ($1, $2, $3, 1)`, [lawyer, stranger, a!.id])).toMatch(/row-level security/)
  })

  it('holds reviews that may reveal contact details or case numbers for moderation', async () => {
    const client = await createUser(db)
    const appt = await completedAppointment(client, 4)
    await q(db, { id: client }, `select public.submit_review($1, null, 2, 'اتصلوا بي على 01012345678 بخصوص دعوى رقم 1234')`, [appt])
    const [r] = await q<{ status: string; flagged_reasons: string[] }>(db, { id: client }, `select status, flagged_reasons from public.reviews where appointment_id = $1`, [appt])
    expect(r!.status).toBe('pending')
    expect(r!.flagged_reasons).toEqual(expect.arrayContaining(['phone_or_id', 'case_number']))
    expect(await q(db, 'anon', `select id from public.reviews where appointment_id = $1`, [appt])).toHaveLength(0)
  })

  it('lets the lawyer respond but not edit the rating; reports hide reviews pending moderation', async () => {
    const client = await createUser(db)
    const appt = await completedAppointment(client, 5)
    const [{ id }] = await q<{ id: string }>(db, { id: client }, `select public.submit_review($1, null, 3, 'جيد') as id`, [appt]) as [{ id: string }]
    await q(db, { id: lawyer }, `update public.reviews set lawyer_response = 'شكرًا لملاحظاتك' where id = $1`, [id])
    expect(await fails(db, { id: lawyer }, `update public.reviews set rating = 5 where id = $1`, [id])).toMatch(/only respond/)
    await q(db, { id: lawyer }, `select public.report_review($1, 'confidential_info', 'يكشف تفاصيل')`, [id])
    const [r] = await q<{ status: string }>(db, 'service', `select status from public.reviews where id = $1`, [id])
    expect(r!.status).toBe('pending')
    await q(db, { id: admin }, `select public.moderate_review($1, 'published', 'لا يحتوي معلومات سرية')`, [id])
    const [r2] = await q<{ status: string }>(db, 'anon', `select status from public.reviews where id = $1`, [id])
    expect(r2!.status).toBe('published')
  })
})

describe('service orders', () => {
  let service: string
  beforeAll(async () => {
    const [s] = await q<{ id: string }>(db, { id: lawyer },
      `insert into public.legal_services (slug, lawyer_id, title_ar, description_ar, price_minor, estimated_days, status, deliverables)
       values ('contract-review-test', $1, 'مراجعة عقد إيجار', 'مراجعة شاملة لعقد الإيجار مع ملاحظات مكتوبة على البنود.', 120000, 3, 'pending_review', array['تقرير ملاحظات'])
       returning id`, [lawyer])
    service = s!.id
    // Lawyers cannot activate their own listing.
    expect(await fails(db, { id: lawyer }, `update public.legal_services set status = 'active' where id = $1`, [service])).toMatch(/platform/)
    await q(db, { id: admin }, `update public.legal_services set status = 'active' where id = $1`, [service])
  })

  it('runs the full lifecycle: order → pay → work → deliver → revision → complete', async () => {
    const client = await createUser(db)
    const [o] = await q<{ id: string }>(db, { id: client }, `select public.create_service_order($1, null, 'مرفق العقد') as id`, [service])
    const [p] = await q<{ id: string }>(db, { id: client }, `select id from public.create_payment('service_order', $1, 'sandbox', 'sandbox', $2)`, [o!.id, idem()])
    const [r] = await q<{ r: string }>(db, 'service', `select public.record_payment_result('sandbox', $1, $2, null, 't', true, 120000, 'EGP', 0, true, '{}') r`, [`so-${o!.id}`, p!.id])
    expect(r!.r).toBe('captured')
    const status = async () => (await q<{ status: string }>(db, 'service', `select status from public.service_orders where id = $1`, [o!.id]))[0]!.status
    expect(await status()).toBe('PAID')
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'IN_PROGRESS')`, [o!.id])
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'DELIVERED')`, [o!.id])
    await q(db, { id: client }, `select public.transition_service_order($1, 'REVISION_REQUESTED', 'برجاء توضيح البند الخامس')`, [o!.id])
    // Only one revision included.
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'DELIVERED')`, [o!.id])
    expect(await fails(db, { id: client }, `select public.transition_service_order($1, 'REVISION_REQUESTED')`, [o!.id])).toMatch(/not available/)
    await q(db, { id: client }, `select public.transition_service_order($1, 'COMPLETED')`, [o!.id])
    expect(await status()).toBe('COMPLETED')
    await q(db, { id: client }, `select public.submit_review(null, $1, 4, 'تسليم في الموعد')`, [o!.id])
  })

  it('refunds in full when the lawyer cancels a paid order', async () => {
    const client = await createUser(db)
    const [o] = await q<{ id: string }>(db, { id: client }, `select public.create_service_order($1, null, null) as id`, [service])
    const [p] = await q<{ id: string }>(db, { id: client }, `select id from public.create_payment('service_order', $1, 'sandbox', 'sandbox', $2)`, [o!.id, idem()])
    await q(db, 'service', `select public.record_payment_result('sandbox', $1, $2, null, 't', true, 120000, 'EGP', 0, true, '{}')`, [`so2-${o!.id}`, p!.id])
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'CANCELLED', 'تعارض مصالح')`, [o!.id])
    const [ref] = await q<{ amount_minor: string }>(db, 'service', `select amount_minor from public.refunds where payment_id = $1`, [p!.id])
    expect(Number(ref!.amount_minor)).toBe(120000)
  })
})

describe('disputes', () => {
  it('a party opens a dispute; admin resolves with a partial refund; other users cannot see it', async () => {
    const client = await createUser(db)
    const slot = await nextSlot(db, lawyer, 'video', 6)
    const [a] = await q<{ id: string }>(db, { id: client }, `select public.book_appointment($1, 'video', $2::timestamptz, $3) as id`, [lawyer, slot, issue])
    const [p] = await q<{ id: string }>(db, { id: client }, `select id from public.create_payment('appointment', $1, 'sandbox', 'sandbox', $2)`, [a!.id, idem()])
    await q(db, 'service', `select public.record_payment_result('sandbox', $1, $2, null, 't', true, 50000, 'EGP', 0, true, '{}')`, [`d-${a!.id}`, p!.id])
    await db.query(`update public.appointments set starts_at = now() - interval '40 minutes', ends_at = now() - interval '10 minutes' where id = $1`, [a!.id])
    await q(db, { id: lawyer }, `select public.transition_appointment($1, 'COMPLETED')`, [a!.id])

    const [d] = await q<{ id: string }>(db, { id: client },
      `select public.open_dispute($1, null, 'quality', 'انتهت الاستشارة قبل موعدها ولم يتم الرد على أسئلتي الأساسية.') as id`, [a!.id])
    expect((await q<{ status: string }>(db, 'service', `select status from public.appointments where id = $1`, [a!.id]))[0]!.status).toBe('DISPUTED')
    const outsider = await createUser(db)
    expect(await q(db, { id: outsider }, `select * from public.disputes where id = $1`, [d!.id])).toHaveLength(0)
    expect(await q(db, { id: lawyer }, `select * from public.disputes where id = $1`, [d!.id])).toHaveLength(1)
    expect(await fails(db, { id: client }, `select public.resolve_dispute($1, 'full_refund', null, 'x')`, [d!.id])).toMatch(/Admin access/)
    await q(db, { id: admin }, `select public.resolve_dispute($1, 'partial_refund', 40, 'رد 40% لإنهاء الاستشارة مبكرًا')`, [d!.id])
    const [ref] = await q<{ amount_minor: string }>(db, 'service', `select amount_minor from public.refunds where payment_id = $1`, [p!.id])
    expect(Number(ref!.amount_minor)).toBe(20000)
  })
})

describe('subscriptions & entitlements', () => {
  it('starts a trial once, then requires payment; payment activates and replaces the old plan', async () => {
    const l = await createUser(db, { type: 'lawyer' })
    const [t] = await q<{ r: { status: string; subscription_id: string } }>(db, { id: l }, `select public.start_subscription('professional', 'monthly') r`)
    expect(t!.r.status).toBe('trialing')
    const [e] = await q<{ e: { plan: { code: string }; features: Record<string, { enabled: boolean }> } }>(db, { id: l }, `select public.my_entitlements() e`)
    expect(e!.e.plan.code).toBe('professional')
    expect(e!.e.features['analytics']!.enabled).toBe(true)

    const [again] = await q<{ r: { status: string; subscription_id: string; requires_payment: boolean } }>(db, { id: l }, `select public.start_subscription('professional', 'yearly') r`)
    expect(again!.r.requires_payment).toBe(true)
    const [p] = await q<{ id: string; amount_minor: string }>(db, { id: l }, `select id, amount_minor from public.create_payment('subscription', $1, 'sandbox', 'sandbox', $2)`, [again!.r.subscription_id, idem()])
    expect(Number(p!.amount_minor)).toBe(499000)
    await q(db, 'service', `select public.record_payment_result('sandbox', $1, $2, null, 't', true, 499000, 'EGP', 0, true, '{}')`, [`sub-${p!.id}`, p!.id])
    const subs = await q<{ status: string; billing_cycle: string }>(db, { id: l }, `select status, billing_cycle from public.subscriptions where lawyer_id = $1 order by created_at`, [l])
    expect(subs.map((s) => s.status)).toEqual(['cancelled', 'active'])
    const [pay] = await q<{ commission_minor: string; net_minor: string }>(db, 'service', `select commission_minor, net_minor from public.payments where id = $1`, [p!.id])
    expect(Number(pay!.commission_minor)).toBe(499000)
    expect(Number(pay!.net_minor)).toBe(0)
  })

  it('basic plan blocks the 4th active matter', async () => {
    const l = await createUser(db, { type: 'lawyer' })
    for (let i = 0; i < 3; i++) {
      await q(db, { id: l }, `insert into public.legal_matters (owner_lawyer_id, title, created_by) values ($1, $2, $1)`, [l, `ملف ${i}`])
    }
    expect(await fails(db, { id: l }, `insert into public.legal_matters (owner_lawyer_id, title, created_by) values ($1, 'ملف 4', $1)`, [l])).toMatch(/limit/)
  })

  it('renewal processing moves overdue paid plans to past_due then expired', async () => {
    const l = await createUser(db, { type: 'lawyer' })
    const [s] = await q<{ id: string }>(db, 'service',
      `insert into public.subscriptions (plan_id, lawyer_id, status, current_period_start, current_period_end)
       select id, $1, 'active', now() - interval '40 days', now() - interval '10 days' from public.subscription_plans where code = 'professional' returning id`, [l])
    await q(db, 'service', `select public.process_subscription_renewals()`)
    expect((await q<{ status: string }>(db, 'service', `select status from public.subscriptions where id = $1`, [s!.id]))[0]!.status).toBe('past_due')
    await q(db, 'service', `select public.process_subscription_renewals()`)
    expect((await q<{ status: string }>(db, 'service', `select status from public.subscriptions where id = $1`, [s!.id]))[0]!.status).toBe('expired')
  })
})

describe('notifications', () => {
  it('deduplicates, honours channel preferences and queues external deliveries with retries', async () => {
    const u = await createUser(db)
    await q(db, { id: u }, `insert into public.notification_preferences (user_id, event_type, channel, enabled) values ($1, '*', 'email', false)`, [u])
    await db.query(`select app.notify($1, 'payment.succeeded', '{"reference":"PAY-1","amount":"500.00"}', '/x', 'dedupe-1')`, [u])
    await db.query(`select app.notify($1, 'payment.succeeded', '{"reference":"PAY-1","amount":"500.00"}', '/x', 'dedupe-1')`, [u])
    const notes = await q<{ id: string; title: string; body: string }>(db, { id: u }, `select id, title, body from public.notifications`)
    expect(notes).toHaveLength(1)
    expect(notes[0]!.body).toContain('PAY-1')
    const deliveries = await q<{ channel: string }>(db, 'service', `select channel from public.notification_deliveries where notification_id = $1`, [notes[0]!.id])
    expect(deliveries.map((d) => d.channel)).toEqual(['sms'])

    const claimed = await q<{ delivery_id: string; email: string }>(db, 'service', `select * from public.claim_notification_deliveries(10)`)
    const mine = claimed.find((c) => deliveries.length && c.email)
    expect(mine).toBeDefined()
    await q(db, 'service', `select public.complete_notification_delivery($1, 'failed', 'twilio', null, 'timeout')`, [mine!.delivery_id])
    const [d] = await q<{ status: string; attempts: number }>(db, 'service', `select status, attempts from public.notification_deliveries where id = $1`, [mine!.delivery_id])
    expect(d).toEqual({ status: 'queued', attempts: 1 })
  })

  it('users only see and mark their own notifications', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    await db.query(`select app.notify($1, 'message.new', '{"sender":"x"}')`, [a])
    expect(await q(db, { id: b }, `select * from public.notifications where user_id = $1`, [a])).toHaveLength(0)
    await q(db, { id: b }, `select public.mark_notifications_read(null)`)
    const [n] = await q<{ read_at: string | null }>(db, { id: a }, `select read_at from public.notifications`)
    expect(n!.read_at).toBeNull()
  })
})

describe('search', () => {
  it('filters by category, price and availability; only public lawyers are returned', async () => {
    const cat = (await q<{ id: string }>(db, 'service', `select id from public.legal_categories where slug = 'employment'`))[0]!.id
    await q(db, { id: lawyer }, `insert into public.lawyer_specializations (lawyer_id, category_id, is_primary) values ($1, $2, true)`, [lawyer, cat])
    const hidden = await createUser(db, { type: 'lawyer' })
    await q(db, { id: hidden }, `insert into public.lawyer_specializations (lawyer_id, category_id) values ($1, $2)`, [hidden, cat])

    const rows = await q<{ id: string; total_count: string; specializations: { slug: string }[] }>(db, 'anon',
      `select * from public.search_lawyers(p_category_slug => 'employment')`)
    expect(rows.map((r) => r.id)).toEqual([lawyer])
    expect(Number(rows[0]!.total_count)).toBe(1)
    expect(rows[0]!.specializations[0]!.slug).toBe('employment')

    expect(await q(db, 'anon', `select * from public.search_lawyers(p_consultation_type => 'video', p_max_price_minor => 1000)`)).toHaveLength(0)
    const day = (await q<{ d: string }>(db, 'anon', `select ((now() at time zone 'Africa/Cairo')::date + 20)::text d`))[0]!.d
    const avail = await q(db, 'anon', `select * from public.search_lawyers(p_available_on => $1::date, p_time_of_day => 'morning')`, [day])
    expect(avail.length).toBeGreaterThanOrEqual(1)
    const sorted = await q<{ id: string }>(db, 'anon', `select * from public.search_lawyers(p_sort => 'soonest')`)
    expect(sorted.length).toBeGreaterThanOrEqual(1)
  })
})

describe('reports', () => {
  it('lawyer and admin reports are scoped', async () => {
    const client = await createUser(db)
    expect(await fails(db, { id: client }, `select public.lawyer_dashboard_stats()`)).toMatch(/Lawyer access/)
    expect(await fails(db, { id: client }, `select public.admin_overview_stats()`)).toMatch(/Staff access/)
    const [s] = await q<{ s: Record<string, number> }>(db, { id: lawyer }, `select public.lawyer_dashboard_stats() s`)
    expect(s!.s).toHaveProperty('completed')
    const [r] = await q<{ r: Record<string, unknown> }>(db, { id: admin }, `select public.admin_report(current_date - 30, current_date) r`)
    expect(r!.r).toHaveProperty('booking_funnel')
    const [lr] = await q<{ r: Record<string, unknown> }>(db, { id: lawyer }, `select public.lawyer_report(current_date - 30, current_date + 60) r`)
    expect(lr!.r).toHaveProperty('bookings_by_day')
  })
})
