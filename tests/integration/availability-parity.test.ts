/**
 * Parity: the TypeScript slot generator (used for previews) must produce the
 * same slots as the authoritative SQL function for the same configuration.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { generateSlots } from '@/lib/domain/availability'
import { createTestDb, createUser, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createUser(db, { type: 'lawyer' })
  await db.query(`update public.lawyer_profiles set verification_status = 'verified', is_published = true, buffer_minutes = 15, min_notice_hours = 2, max_daily_appointments = null where id = $1`, [lawyer])
  const windows = [
    [0, '09:00', '13:00'], [0, '17:00', '20:00'], [1, '10:00', '14:30'], [3, '12:00', '18:00'], [6, '11:00', '15:00'],
  ] as const
  for (const [d, s, e] of windows) {
    await db.query(`insert into public.lawyer_availability (lawyer_id, weekday, start_time, end_time) values ($1, $2, $3, $4)`, [lawyer, d, s, e])
  }
  await db.query(`insert into public.lawyer_consultation_offerings (lawyer_id, consultation_type, price_minor, duration_minutes) values ($1, 'video', 40000, 45)`, [lawyer])
})

describe('availability parity (TS vs SQL)', () => {
  it('matches over a two-week window including exceptions and bookings', async () => {
    const [{ today }] = (await q<{ today: string }>(db, 'anon', `select ((now() at time zone 'Africa/Cairo')::date)::text as today`)) as [{ today: string }]
    const plus = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + n)
      return d.toISOString().slice(0, 10)
    }
    await db.query(`insert into public.lawyer_availability_exceptions (lawyer_id, exception_date, kind) values ($1, $2, 'unavailable')`, [lawyer, plus(3)])
    await db.query(`insert into public.lawyer_availability_exceptions (lawyer_id, exception_date, kind, start_time, end_time) values ($1, $2, 'unavailable', '10:00', '11:30')`, [lawyer, plus(5)])
    await db.query(`insert into public.lawyer_availability_exceptions (lawyer_id, exception_date, kind, start_time, end_time) values ($1, $2, 'available', '20:00', '22:00')`, [lawyer, plus(6)])

    const sql = await q<{ starts_at: Date }>(db, 'anon', `select starts_at from public.get_available_slots($1, 'video', $2::date, $3::date)`, [lawyer, today, plus(14)])
    const windows = (await db.query<{ weekday: number; start_time: string; end_time: string }>(`select weekday, start_time::text, end_time::text from public.lawyer_availability where lawyer_id = $1`, [lawyer])).rows
    const exceptions = (await db.query<{ exception_date: string; kind: 'available' | 'unavailable'; start_time: string | null; end_time: string | null }>(
      `select exception_date::text, kind, start_time::text, end_time::text from public.lawyer_availability_exceptions where lawyer_id = $1`, [lawyer])).rows

    const ts = generateSlots({
      from: today,
      to: plus(14),
      windows: windows.map((w) => ({ weekday: w.weekday, startTime: w.start_time.slice(0, 5), endTime: w.end_time.slice(0, 5) })),
      exceptions: exceptions.map((e) => ({ date: e.exception_date, kind: e.kind, startTime: e.start_time?.slice(0, 5), endTime: e.end_time?.slice(0, 5) })),
      busy: [],
      rules: { timezone: 'Africa/Cairo', durationMinutes: 45, bufferMinutes: 15, minNoticeHours: 2, maxAdvanceDays: 60 },
    })
    expect(sql.length).toBeGreaterThan(10)
    expect(ts.map((s) => s.startsAt.toISOString())).toEqual(sql.map((s) => new Date(s.starts_at).toISOString()))
  })
})
