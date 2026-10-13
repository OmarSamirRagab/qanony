import { beforeAll, describe, expect, it } from 'vitest'
import { createPublishedLawyer, createTestDb, createUser, fails, idem, nextSlot, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string

const issue = 'أحتاج استشارة بخصوص عقد إيجار ومدة الإخطار المطلوبة قبل الإخلاء.'

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createPublishedLawyer(db)
})

describe('scheduled jobs', () => {
  it('auto-completes delivered service orders after the review window only', async () => {
    const [s] = await q<{ id: string }>(db, { id: lawyer },
      `insert into public.legal_services (slug, lawyer_id, title_ar, description_ar, price_minor, estimated_days, status, deliverables)
       values ('jobs-test-service', $1, 'صياغة عقد', 'صياغة عقد عمل كامل وفق احتياجات العميل مع مراجعة واحدة.', 80000, 3, 'pending_review', array['مسودة'])
       returning id`, [lawyer])
    await db.query(`update public.legal_services set status = 'active' where id = $1`, [s!.id])
    const client = await createUser(db)
    const [o] = await q<{ id: string }>(db, { id: client }, `select public.create_service_order($1, null, 'تفاصيل') as id`, [s!.id])
    const [p] = await q<{ id: string }>(db, { id: client }, `select id from public.create_payment('service_order', $1, 'sandbox', 'sandbox', $2)`, [o!.id, idem()])
    await q(db, 'service', `select public.record_payment_result('sandbox', $1, $2, null, 't', true, 80000, 'EGP', 0, true, '{}')`, [`job-${o!.id}`, p!.id])
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'IN_PROGRESS')`, [o!.id])
    await q(db, { id: lawyer }, `select public.transition_service_order($1, 'DELIVERED')`, [o!.id])
    const status = async () => (await q<{ status: string }>(db, 'service', `select status from public.service_orders where id = $1`, [o!.id]))[0]!.status

    await q(db, 'service', `select public.auto_complete_delivered_orders()`)
    expect(await status()).toBe('DELIVERED')

    await db.query(`update public.service_orders set delivered_at = now() - interval '8 days' where id = $1`, [o!.id])
    const [r] = await q<{ n: number }>(db, 'service', `select public.auto_complete_delivered_orders() as n`)
    expect(r!.n).toBeGreaterThanOrEqual(1)
    expect(await status()).toBe('COMPLETED')
  })

  it('job functions are not callable by end users', async () => {
    const user = await createUser(db)
    for (const fn of ['auto_complete_delivered_orders()', 'expire_stale_appointments()', 'process_subscription_renewals()', 'claim_refunds(1)', 'claim_notification_deliveries(1)']) {
      expect(await fails(db, { id: user }, `select public.${fn}`)).toMatch(/permission denied/)
    }
  })
})

describe('no-show handling', () => {
  it('lets the lawyer mark a no-show only 15 minutes after the start', async () => {
    const client = await createUser(db)
    const slot = await nextSlot(db, lawyer, 'video', 3)
    const [a] = await q<{ id: string }>(db, { id: client }, `select public.book_appointment($1, 'video', $2::timestamptz, $3) as id`, [lawyer, slot, issue])
    // Test setup: treat the booking as paid and confirmed, starting 5 minutes ago.
    await db.query(`update public.appointments set status = 'CONFIRMED', hold_expires_at = null, starts_at = now() - interval '5 minutes', ends_at = now() + interval '25 minutes' where id = $1`, [a!.id])
    expect(await fails(db, { id: lawyer }, `select public.transition_appointment($1, 'NO_SHOW')`, [a!.id])).not.toBe('')
    await db.query(`update public.appointments set starts_at = now() - interval '20 minutes', ends_at = now() + interval '10 minutes' where id = $1`, [a!.id])
    // The client can never mark a no-show.
    expect(await fails(db, { id: client }, `select public.transition_appointment($1, 'NO_SHOW')`, [a!.id])).not.toBe('')
    await q(db, { id: lawyer }, `select public.transition_appointment($1, 'NO_SHOW')`, [a!.id])
    const [row] = await q<{ status: string }>(db, 'service', `select status from public.appointments where id = $1`, [a!.id])
    expect(row!.status).toBe('NO_SHOW')
  })
})
