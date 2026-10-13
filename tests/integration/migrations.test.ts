import { describe, expect, it } from 'vitest'
import { createTestDb } from '../helpers/db'

describe('migrations', () => {
  it('apply cleanly with seed data', async () => {
    const db = await createTestDb()
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.governorates`)
    expect(rows[0]!.n).toBe(27)
    const cats = await db.query<{ n: number }>(`select count(*)::int as n from public.legal_categories`)
    expect(cats.rows[0]!.n).toBe(24)
  })

  it('enable RLS on every public table', async () => {
    const db = await createTestDb({ seed: false })
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows.map((r) => r.relname)).toEqual([])
  })
})
