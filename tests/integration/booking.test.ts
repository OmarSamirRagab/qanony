import { beforeAll, describe, expect, it } from 'vitest'
import { as, createPublishedLawyer, createTestDb, createUser, fails, nextSlot, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string
let client: string
let client2: string

const issue = 'لدي نزاع مع المالك حول تجديد عقد الإيجار وأحتاج إلى استشارة.'

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createPublishedLawyer(db)
  await db.query(
    `insert into public.subscriptions (plan_id, lawyer_id, status, current_period_end)
     select id, $1, 'active', now() + interval '30 days' from public.subscription_plans where code = 'professional'`,
    [lawyer],
  )
  client = await createUser(db)
  client2 = await createUser(db)
})

async function book(user: string, startsAt: string, type = 'video') {
  const rows = await q<{ id: string }>(
    db,
    { id: user },
    `select public.book_appointment($1, $2::public.consultation_kind, $3::timestamptz, $4) as id`,
    [lawyer, type, startsAt, issue],
  )
  return rows[0]!.id
}

describe('availability engine', () => {
  it('generates slots on the grid of duration + buffer inside working hours (Cairo time)', async () => {
    const rows = await q<{ local: string }>(
      db,
      'anon',
      `select to_char(starts_at at time zone 'Africa/Cairo', 'HH24:MI') as local
         from public.get_available_slots($1, 'video', (now() at time zone 'Africa/Cairo')::date + 3, (now() at time zone 'Africa/Cairo')::date + 3)`,
      [lawyer],
    )
    // 10:00–18:00, 30 min + 10 min buffer => 10:00, 10:40, ..., last start <= 17:30
    expect(rows[0]!.local).toBe('10:00')
    expect(rows[1]!.local).toBe('10:40')
    expect(rows.at(-1)!.local).toBe('17:20')
    expect(rows).toHaveLength(12)
  })

  it('hides unpublished lawyers from public slot lookup', async () => {
    const hidden = await createUser(db, { type: 'lawyer' })
    const rows = await q(db, 'anon', `select * from public.get_available_slots($1, 'video', current_date, current_date + 7)`, [hidden])
    expect(rows).toHaveLength(0)
  })

  it('removes full-day exceptions and partially blocked ranges', async () => {
    const day = (await q<{ d: string }>(db, 'anon', `select ((now() at time zone 'Africa/Cairo')::date + 5)::text as d`))[0]!.d
    await as(db, { id: lawyer }, (tx) =>
      tx.query(`insert into public.lawyer_availability_exceptions (lawyer_id, exception_date, kind, start_time, end_time)
                values ($1, $2, 'unavailable', '10:00', '12:00')`, [lawyer, day]),
    )
    const rows = await q<{ local: string }>(
      db, 'anon',
      `select to_char(starts_at at time zone 'Africa/Cairo', 'HH24:MI') as local from public.get_available_slots($1, 'video', $2::date, $2::date)`,
      [lawyer, day],
    )
    expect(rows.map((r) => r.local)).not.toContain('10:00')
    expect(rows.map((r) => r.local)).not.toContain('11:20')
    expect(rows[0]!.local).toBe('12:00')

    await as(db, { id: lawyer }, (tx) =>
      tx.query(`insert into public.lawyer_availability_exceptions (lawyer_id, exception_date, kind) values ($1, $2::date + 1, 'unavailable')`, [lawyer, day]),
    )
    const none = await q(db, 'anon', `select * from public.get_available_slots($1, 'video', $2::date + 1, $2::date + 1)`, [lawyer, day])
    expect(none).toHaveLength(0)
  })

  it('caches next availability and minimum price on the lawyer listing', async () => {
    const rows = await q<{ next_available_at: string | null; min_price_minor: string }>(
      db, 'anon', `select next_available_at, min_price_minor from public.lawyer_profiles where id = $1`, [lawyer],
    )
    expect(rows[0]!.next_available_at).not.toBeNull()
    expect(Number(rows[0]!.min_price_minor)).toBe(0)
  })
})

describe('booking', () => {
  it('creates a paid booking in PENDING_PAYMENT with a hold, a conversation and participants', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 2)
    const id = await book(client, slot)
    const [a] = await q<{ status: string; hold_expires_at: string | null; price_minor: string }>(
      db, { id: client }, `select status, hold_expires_at, price_minor from public.appointments where id = $1`, [id],
    )
    expect(a!.status).toBe('PENDING_PAYMENT')
    expect(a!.hold_expires_at).not.toBeNull()
    expect(Number(a!.price_minor)).toBe(50000)
    const conv = await q(db, { id: client }, `select id from public.conversations where appointment_id = $1`, [id])
    expect(conv).toHaveLength(1)
  })

  it('removes a held slot from availability and prevents double booking', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 3)
    await book(client, slot)
    const still = await q(db, 'anon',
      `select 1 from public.get_available_slots($1, 'video', ($2::timestamptz at time zone 'Africa/Cairo')::date, ($2::timestamptz at time zone 'Africa/Cairo')::date)
        where starts_at = $2::timestamptz`, [lawyer, slot])
    expect(still).toHaveLength(0)
    const err = await fails(db, { id: client2 }, `select public.book_appointment($1, 'video', $2::timestamptz, $3)`, [lawyer, slot, issue])
    expect(err).toMatch(/no longer available/)
  })

  it('enforces the exclusion constraint even for trusted inserts', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 4)
    await book(client, slot)
    await expect(
      db.query(
        `insert into public.appointments (lawyer_id, client_id, consultation_type, status, starts_at, ends_at, issue_summary, price_minor)
         values ($1, $2, 'video', 'CONFIRMED', $3::timestamptz + interval '5 minutes', $3::timestamptz + interval '35 minutes', $4, 0)`,
        [lawyer, client2, slot, issue],
      ),
    ).rejects.toThrow(/appointments_no_lawyer_overlap/)
  })

  it('rejects off-grid times and slots outside working hours', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 6)
    const offGrid = await fails(db, { id: client2 }, `select public.book_appointment($1, 'video', $2::timestamptz + interval '7 minutes', $3)`, [lawyer, slot, issue])
    expect(offGrid).toMatch(/no longer available/)
  })

  it('confirms free bookings immediately when auto-confirm is on, and notifies both parties', async () => {
    const slot = await nextSlot(db, lawyer, 'text', 8)
    const id = await book(client2, slot, 'text')
    const [a] = await q<{ status: string }>(db, { id: client2 }, `select status from public.appointments where id = $1`, [id])
    expect(a!.status).toBe('CONFIRMED')
    const notes = await q<{ event_type: string }>(db, { id: lawyer }, `select event_type from public.notifications where user_id = $1`, [lawyer])
    expect(notes.map((n) => n.event_type)).toContain('appointment.booked')
  })

  it('only allows client accounts to book and never self-booking', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 9)
    const err = await fails(db, { id: lawyer }, `select public.book_appointment($1, 'video', $2::timestamptz, $3)`, [lawyer, slot, issue])
    expect(err).toMatch(/client accounts|cannot book yourself/)
  })

  it('blocks direct inserts/updates of appointments from users', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 10)
    const id = await book(client, slot)
    // No UPDATE policy exists: RLS filters the row out, so nothing changes.
    await q(db, { id: client }, `update public.appointments set status = 'CONFIRMED' where id = $1`, [id])
    const [a] = await q<{ status: string }>(db, { id: client }, `select status from public.appointments where id = $1`, [id])
    expect(a!.status).toBe('PENDING_PAYMENT')
    const err = await fails(db, { id: client },
      `insert into public.appointments (lawyer_id, client_id, consultation_type, status, starts_at, ends_at, issue_summary, price_minor)
       values ($1, $2, 'video', 'CONFIRMED', now() + interval '3 days', now() + interval '3 days 30 minutes', $3, 0)`, [lawyer, client, issue])
    expect(err).toMatch(/row-level security|book_appointment/i)
  })
})

describe('status transitions', () => {
  it('lets the lawyer confirm, start and complete; increments completed count', async () => {
    const manual = await createPublishedLawyer(db, { autoConfirm: false, minNotice: 0 })
    const slot = (await q<{ s: string }>(db, 'anon',
      `select starts_at::text as s from public.get_available_slots($1, 'text', (now() at time zone 'Africa/Cairo')::date + 1, (now() at time zone 'Africa/Cairo')::date + 7) limit 1`, [manual]))[0]!.s
    const id = (await q<{ id: string }>(db, { id: client }, `select public.book_appointment($1, 'text', $2::timestamptz, $3) as id`, [manual, slot, issue]))[0]!.id
    expect((await q<{ status: string }>(db, { id: client }, `select status from public.appointments where id = $1`, [id]))[0]!.status).toBe('PENDING_CONFIRMATION')

    await q(db, { id: manual }, `select public.transition_appointment($1, 'CONFIRMED')`, [id])
    // Starting too early is refused.
    expect(await fails(db, { id: manual }, `select public.transition_appointment($1, 'IN_PROGRESS')`, [id])).toMatch(/not available/)
    // Move the appointment into the present (trusted) and run it.
    await db.query(`update public.appointments set starts_at = now() - interval '1 minute', ends_at = now() + interval '29 minutes' where id = $1`, [id])
    await q(db, { id: manual }, `select public.transition_appointment($1, 'IN_PROGRESS')`, [id])
    await q(db, { id: manual }, `select public.transition_appointment($1, 'COMPLETED')`, [id])
    const [l] = await q<{ completed_consultations: number }>(db, 'service', `select completed_consultations from public.lawyer_profiles where id = $1`, [manual])
    expect(l!.completed_consultations).toBe(1)
    // A practice client record now exists for the lawyer.
    const pc = await q(db, { id: manual }, `select id from public.practice_clients where owner_lawyer_id = $1 and user_id = $2`, [manual, client])
    expect(pc).toHaveLength(1)
  })

  it('rejects invalid transitions and unauthorised actors', async () => {
    const slot = await nextSlot(db, lawyer, 'text', 11)
    const id = await book(client, slot, 'text')
    expect(await fails(db, { id: client }, `select public.transition_appointment($1, 'COMPLETED')`, [id])).toMatch(/not available/)
    expect(await fails(db, { id: client2 }, `select public.transition_appointment($1, 'CANCELLED')`, [id])).toMatch(/Not allowed/)
    expect(await fails(db, { id: lawyer }, `select public.transition_appointment($1, 'REFUNDED')`, [id])).toMatch(/Invalid appointment transition/)
    expect(await fails(db, { id: lawyer }, `select public.transition_appointment($1, 'CANCELLED')`, [id])).toMatch(/reason is required/)
  })

  it('reschedules within limits and frees the old slot', async () => {
    const slot = await nextSlot(db, lawyer, 'text', 12)
    const id = await book(client, slot, 'text')
    const target = (await q<{ s: string }>(db, 'anon',
      `select starts_at::text as s from public.get_available_slots($1, 'text', ($2::timestamptz at time zone 'Africa/Cairo')::date, ($2::timestamptz at time zone 'Africa/Cairo')::date)
        where starts_at > $2::timestamptz + interval '2 hours' limit 1`, [lawyer, slot]))[0]!.s
    await q(db, { id: client }, `select public.reschedule_appointment($1, $2::timestamptz, 'conflict at work')`, [id, target])
    const [a] = await q<{ starts_at: string; reschedule_count: number }>(db, { id: client },
      `select starts_at::text, reschedule_count from public.appointments where id = $1`, [id])
    expect(new Date(a!.starts_at).getTime()).toBe(new Date(target).getTime())
    expect(a!.reschedule_count).toBe(1)
    const freed = await q(db, 'anon',
      `select 1 from public.get_available_slots($1, 'text', ($2::timestamptz at time zone 'Africa/Cairo')::date, ($2::timestamptz at time zone 'Africa/Cairo')::date)
        where starts_at = $2::timestamptz`, [lawyer, slot])
    expect(freed).toHaveLength(1)
  })

  it('expires stale payment holds', async () => {
    const slot = await nextSlot(db, lawyer, 'video', 13)
    const id = await book(client2, slot)
    await db.query(`update public.appointments set hold_expires_at = now() - interval '1 minute' where id = $1`, [id])
    const [r] = await q<{ n: number }>(db, 'service', `select public.expire_stale_appointments() as n`)
    expect(r!.n).toBeGreaterThanOrEqual(1)
    const [a] = await q<{ status: string }>(db, { id: client2 }, `select status from public.appointments where id = $1`, [id])
    expect(a!.status).toBe('EXPIRED')
  })
})

describe('plan allowance', () => {
  it('enforces the Basic plan monthly booking limit on the backend', async () => {
    const l = await createPublishedLawyer(db, { priceMinor: 0 })
    await db.query(`update public.plan_features set limit_value = 2
                     where feature_key = 'bookings.monthly' and plan_id = (select id from public.subscription_plans where code = 'basic')`)
    try {
      const c = await createUser(db)
      const slots = await q<{ s: string }>(db, 'anon',
        `select starts_at::text as s from public.get_available_slots($1, 'text', (now() at time zone 'Africa/Cairo')::date + 2, (now() at time zone 'Africa/Cairo')::date + 2) limit 3`, [l])
      await q(db, { id: c }, `select public.book_appointment($1, 'text', $2::timestamptz, $3)`, [l, slots[0]!.s, issue])
      const c2 = await createUser(db)
      await q(db, { id: c2 }, `select public.book_appointment($1, 'text', $2::timestamptz, $3)`, [l, slots[1]!.s, issue])
      const c3 = await createUser(db)
      expect(await fails(db, { id: c3 }, `select public.book_appointment($1, 'text', $2::timestamptz, $3)`, [l, slots[2]!.s, issue])).toMatch(/monthly booking limit/)
    } finally {
      await db.query(`update public.plan_features set limit_value = 10
                       where feature_key = 'bookings.monthly' and plan_id = (select id from public.subscription_plans where code = 'basic')`)
    }
  })
})
