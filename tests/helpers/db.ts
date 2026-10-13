/**
 * In-process PostgreSQL (PGlite) loaded with the Supabase shim, every migration
 * and the seed. Lets integration/security tests exercise real RLS policies,
 * triggers and RPCs exactly as written for Supabase.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..')

export type Db = PGlite
export type Tx = Transaction
export type Actor = { id: string } | 'anon' | 'service'

export async function createTestDb(options: { seed?: boolean } = {}): Promise<Db> {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec(readFileSync(path.join(root, 'tests/helpers/supabase-shim.sql'), 'utf8'))
  const dir = path.join(root, 'supabase/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, file), 'utf8'))
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`)
    }
  }
  if (options.seed !== false) {
    await db.exec(readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8'))
  }
  return db
}

/** Run `fn` inside a transaction as the given actor, with RLS in force. */
export async function as<T>(db: Db, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (actor === 'service') {
      await tx.exec(`set local role service_role`)
    } else if (actor === 'anon') {
      await tx.exec(`set local role anon`)
    } else {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actor.id])
      await tx.exec(`set local role authenticated`)
    }
    return fn(tx)
  })
}

/** Convenience: single query as an actor, returning rows. */
export async function q<T = Record<string, unknown>>(db: Db, actor: Actor, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(db, actor, async (tx) => (await tx.query<T>(sql, params)).rows)
}

/** Expect a statement to fail; returns the error message. */
export async function fails(db: Db, actor: Actor, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await q(db, actor, sql, params)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error(`Expected failure but succeeded: ${sql}`)
}

let counter = 0
export async function createUser(
  db: Db,
  opts: { type?: 'client' | 'lawyer'; name?: string; email?: string; roles?: string[] } = {},
): Promise<string> {
  counter += 1
  const email = opts.email ?? `user${counter}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, now(), $2::jsonb) returning id`,
    [email, JSON.stringify({ account_type: opts.type ?? 'client', full_name: opts.name ?? `User ${counter}`, terms_accepted: true })],
  )
  const id = res.rows[0]!.id
  for (const role of opts.roles ?? []) {
    await db.query(`insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing`, [id, role])
  }
  return id
}

/**
 * Creates a verified, published lawyer with Sunday–Thursday 10:00–18:00
 * availability and a paid video offering (30 min, 500 EGP) plus a free text offering.
 */
export async function createPublishedLawyer(
  db: Db,
  opts: { priceMinor?: number; buffer?: number; maxDaily?: number | null; autoConfirm?: boolean; minNotice?: number } = {},
): Promise<string> {
  const id = await createUser(db, { type: 'lawyer', name: 'محامي اختبار' })
  await db.query(
    `update public.lawyer_profiles set verification_status = 'verified', verified_at = now(), is_published = true,
            buffer_minutes = $2, max_daily_appointments = $3, auto_confirm = $4, min_notice_hours = $5,
            governorate_id = (select id from public.governorates where code = 'C'), years_experience = 8
      where id = $1`,
    [id, opts.buffer ?? 10, opts.maxDaily ?? null, opts.autoConfirm ?? true, opts.minNotice ?? 0],
  )
  for (let weekday = 0; weekday <= 6; weekday++) {
    await db.query(
      `insert into public.lawyer_availability (lawyer_id, weekday, start_time, end_time) values ($1, $2, '10:00', '18:00')`,
      [id, weekday],
    )
  }
  await db.query(
    `insert into public.lawyer_consultation_offerings (lawyer_id, consultation_type, price_minor, duration_minutes)
     values ($1, 'video', $2, 30), ($1, 'text', 0, 30), ($1, 'written_opinion', 150000, 30)`,
    [id, opts.priceMinor ?? 50000],
  )
  await db.query(
    `insert into public.lawyer_offices (lawyer_id, label, address_ar) values ($1, 'المكتب الرئيسي', 'شارع التحرير، الدقي، الجيزة')`,
    [id],
  )
  await db.query(
    `insert into public.lawyer_consultation_offerings (lawyer_id, consultation_type, price_minor, duration_minutes)
     values ($1, 'in_person', 80000, 60)`,
    [id],
  )
  return id
}

/** Next slot for a lawyer/type at least `daysAhead` days in the future. */
export async function nextSlot(db: Db, lawyerId: string, type = 'video', daysAhead = 2): Promise<string> {
  const rows = await q<{ starts_at: string }>(
    db,
    'anon',
    `select starts_at::text from public.get_available_slots($1, $2::public.consultation_kind,
        (now() at time zone 'Africa/Cairo')::date + $3::int, (now() at time zone 'Africa/Cairo')::date + $3::int + 7) limit 1`,
    [lawyerId, type, daysAhead],
  )
  if (!rows[0]) throw new Error('No slot available')
  return rows[0].starts_at
}

export const idem = () => `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
