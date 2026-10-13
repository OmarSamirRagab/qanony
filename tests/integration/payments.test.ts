import { beforeAll, describe, expect, it } from 'vitest'
import { createPublishedLawyer, createTestDb, createUser, fails, idem, nextSlot, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string
let client: string
let admin: string
let day = 2

const issue = 'أحتاج مراجعة عقد شراء شقة قبل التوقيع النهائي هذا الأسبوع.'

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createPublishedLawyer(db, { priceMinor: 50000 })
  await db.query(
    `insert into public.subscriptions (plan_id, lawyer_id, status, current_period_end)
     select id, $1, 'active', now() + interval '30 days' from public.subscription_plans where code = 'professional'`, [lawyer])
  client = await createUser(db)
  admin = await createUser(db, { roles: ['admin'] })
})

async function bookPaid(user = client) {
  const slot = await nextSlot(db, lawyer, 'video', day++)
  const [r] = await q<{ id: string }>(db, { id: user }, `select public.book_appointment($1, 'video', $2::timestamptz, $3) as id`, [lawyer, slot, issue])
  return r!.id
}

async function pay(appointmentId: string, user = client) {
  const [p] = await q<{ id: string; amount_minor: string; reference: string }>(
    db, { id: user },
    `select id, amount_minor, reference from public.create_payment('appointment', $1, 'sandbox', 'sandbox', $2)`,
    [appointmentId, idem()],
  )
  return p!
}

async function webhook(paymentId: string, eventId: string, opts: { success?: boolean; amount?: number; signature?: boolean; fee?: number } = {}) {
  const [r] = await q<{ r: string }>(
    db, 'service',
    `select public.record_payment_result('sandbox', $1, $2, null, $3, $4, $5, 'EGP', $6, $7, '{}'::jsonb) as r`,
    [eventId, paymentId, `txn-${eventId}`, opts.success ?? true, opts.amount ?? 50000, opts.fee ?? 0, opts.signature ?? true],
  )
  return r!.r
}

async function ledgerBalance() {
  const [r] = await q<{ d: string; c: string }>(db, 'service', `select coalesce(sum(debit_minor),0) d, coalesce(sum(credit_minor),0) c from public.financial_ledger_entries`)
  return { debit: Number(r!.d), credit: Number(r!.c) }
}

describe('payments', () => {
  it('takes the amount from the database and is idempotent per key', async () => {
    const appt = await bookPaid()
    const key = idem()
    const [a] = await q<{ id: string; amount_minor: string }>(db, { id: client }, `select id, amount_minor from public.create_payment('appointment', $1, 'sandbox', 'sandbox', $2)`, [appt, key])
    const [b] = await q<{ id: string }>(db, { id: client }, `select id from public.create_payment('appointment', $1, 'sandbox', 'sandbox', $2)`, [appt, key])
    expect(Number(a!.amount_minor)).toBe(50000)
    expect(b!.id).toBe(a!.id)
  })

  it('cannot be marked successful by the client', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    const err = await fails(db, { id: client },
      `select public.record_payment_result('sandbox', 'x', $1, null, 't', true, 50000, 'EGP', 0, true, '{}')`, [p.id])
    expect(err).toMatch(/permission denied/)
    await q(db, { id: client }, `update public.payments set status = 'succeeded' where id = $1`, [p.id])
    const [row] = await q<{ status: string }>(db, { id: client }, `select status from public.payments where id = $1`, [p.id])
    expect(row!.status).toBe('initiated')
  })

  it('captures, snapshots commission, confirms the booking, issues an invoice and balances the ledger', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    expect(await webhook(p.id, 'evt-capture-1', { fee: 1500 })).toBe('captured')
    const [row] = await q<{ status: string; commission_minor: string; commission_rate_bps: number; net_minor: string; gateway_fee_minor: string }>(
      db, { id: client }, `select status, commission_minor, commission_rate_bps, net_minor, gateway_fee_minor from public.payments where id = $1`, [p.id])
    expect(row!.status).toBe('succeeded')
    expect(row!.commission_rate_bps).toBe(1500)
    expect(Number(row!.commission_minor)).toBe(7500)
    expect(Number(row!.net_minor)).toBe(42500)   // platform bears gateway fee by default
    expect(Number(row!.gateway_fee_minor)).toBe(1500)
    const [a] = await q<{ status: string }>(db, { id: client }, `select status from public.appointments where id = $1`, [appt])
    expect(a!.status).toBe('CONFIRMED')
    const inv = await q<{ status: string; total_minor: string }>(db, { id: client }, `select status, total_minor from public.invoices where payment_id = $1`, [p.id])
    expect(inv[0]!.status).toBe('paid')
    const bal = await ledgerBalance()
    expect(bal.debit).toBe(bal.credit)
    const [lb] = await q<{ b: string }>(db, 'service', `select app.beneficiary_balance_minor($1, null) b`, [lawyer])
    expect(Number(lb!.b)).toBe(42500)
  })

  it('ignores duplicate webhooks (no double capture, no double ledger)', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    expect(await webhook(p.id, 'evt-dup')).toBe('captured')
    const before = await ledgerBalance()
    expect(await webhook(p.id, 'evt-dup')).toBe('duplicate')
    expect(await webhook(p.id, 'evt-dup-2')).toBe('already_captured')
    const after = await ledgerBalance()
    expect(after).toEqual(before)
    const inv = await q(db, 'service', `select id from public.invoices where payment_id = $1`, [p.id])
    expect(inv).toHaveLength(1)
  })

  it('rejects invalid signatures and amount mismatches', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    expect(await webhook(p.id, 'evt-badsig', { signature: false })).toBe('invalid_signature')
    expect(await webhook(p.id, 'evt-mismatch', { amount: 100 })).toBe('amount_mismatch')
    const [row] = await q<{ status: string }>(db, 'service', `select status from public.payments where id = $1`, [p.id])
    expect(row!.status).toBe('failed')
  })

  it('auto-refunds a late payment for an expired hold whose slot was taken', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    // Hold expires and someone else books the same slot.
    await db.query(`update public.appointments set hold_expires_at = now() - interval '1 minute' where id = $1`, [appt])
    await q(db, 'service', `select public.expire_stale_appointments()`)
    const [{ starts_at }] = await q<{ starts_at: string }>(db, 'service', `select starts_at::text from public.appointments where id = $1`, [appt]) as [{ starts_at: string }]
    const other = await createUser(db)
    await q(db, { id: other }, `select public.book_appointment($1, 'video', $2::timestamptz, $3)`, [lawyer, starts_at, issue])
    expect(await webhook(p.id, 'evt-late')).toBe('captured_refund_required')
    const refunds = await q<{ amount_minor: string; status: string }>(db, 'service', `select amount_minor, status from public.refunds where payment_id = $1`, [p.id])
    expect(refunds).toHaveLength(1)
    expect(Number(refunds[0]!.amount_minor)).toBe(50000)
  })
})

describe('refunds', () => {
  it('refunds in full when the client cancels before the deadline, reversing the ledger', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    await webhook(p.id, `evt-${appt}`)
    await q(db, { id: client }, `select public.transition_appointment($1, 'CANCELLED', 'لم أعد بحاجة للاستشارة')`, [appt])
    const [r] = await q<{ id: string; amount_minor: string; status: string }>(db, 'service', `select id, amount_minor, status from public.refunds where payment_id = $1`, [p.id])
    expect(r!.status).toBe('approved')
    expect(Number(r!.amount_minor)).toBe(50000)

    const claimed = await q<{ id: string }>(db, 'service', `select id from public.claim_refunds(10)`)
    expect(claimed.map((c) => c.id)).toContain(r!.id)
    await q(db, 'service', `select public.complete_refund($1, true, 'rf-1', null)`, [r!.id])

    const [pay2] = await q<{ status: string; refunded_minor: string }>(db, 'service', `select status, refunded_minor from public.payments where id = $1`, [p.id])
    expect(pay2!.status).toBe('refunded')
    const [a] = await q<{ status: string }>(db, 'service', `select status from public.appointments where id = $1`, [appt])
    expect(a!.status).toBe('REFUNDED')
    const bal = await ledgerBalance()
    expect(bal.debit).toBe(bal.credit)
    // Completing again is a no-op.
    await q(db, 'service', `select public.complete_refund($1, true, 'rf-1', null)`, [r!.id])
    const [pay3] = await q<{ refunded_minor: string }>(db, 'service', `select refunded_minor from public.payments where id = $1`, [p.id])
    expect(Number(pay3!.refunded_minor)).toBe(50000)
  })

  it('applies the late-cancellation percentage after the lawyer deadline', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    await webhook(p.id, `evt-late-${appt}`)
    // Move the appointment within the 24h deadline.
    await db.query(`update public.appointments set starts_at = now() + interval '5 hours', ends_at = now() + interval '5 hours 30 minutes' where id = $1`, [appt])
    await q(db, { id: client }, `select public.transition_appointment($1, 'CANCELLED', null)`, [appt])
    const [r] = await q<{ amount_minor: string }>(db, 'service', `select amount_minor from public.refunds where payment_id = $1`, [p.id])
    expect(Number(r!.amount_minor)).toBe(25000)
  })

  it('refunds in full when the lawyer cancels', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    await webhook(p.id, `evt-l-${appt}`)
    await q(db, { id: lawyer }, `select public.transition_appointment($1, 'CANCELLED', 'ظرف طارئ')`, [appt])
    const [r] = await q<{ amount_minor: string }>(db, 'service', `select amount_minor from public.refunds where payment_id = $1`, [p.id])
    expect(Number(r!.amount_minor)).toBe(50000)
  })

  it('never refunds more than was paid (admin manual refunds included)', async () => {
    const appt = await bookPaid()
    const p = await pay(appt)
    await webhook(p.id, `evt-m-${appt}`)
    await q(db, { id: admin }, `select public.admin_create_refund($1, 30000, 'goodwill')`, [p.id])
    await q(db, { id: admin }, `select public.admin_create_refund($1, 30000, 'goodwill 2')`, [p.id])
    const rows = await q<{ amount_minor: string }>(db, 'service', `select amount_minor from public.refunds where payment_id = $1 order by created_at`, [p.id])
    expect(rows.map((r) => Number(r.amount_minor))).toEqual([30000, 20000])
    expect(await fails(db, { id: admin }, `select public.admin_create_refund($1, 1, 'x')`, [p.id])).toMatch(/Nothing refundable/)
    expect(await fails(db, { id: client }, `select public.admin_create_refund($1, 1, 'x')`, [p.id])).toMatch(/Admin access required/)
  })
})

describe('commission rules', () => {
  it('prefers lawyer-specific rules over the global default and snapshots the rule', async () => {
    const special = await createPublishedLawyer(db, { priceMinor: 100000 })
    await db.query(`insert into public.commission_rules (scope, lawyer_id, rate_bps) values ('lawyer', $1, 1000)`, [special])
    const slot = await nextSlot(db, special, 'video', 3)
    const fresh = await createUser(db)
    const [b] = await q<{ id: string }>(db, { id: fresh }, `select public.book_appointment($1, 'video', $2::timestamptz, $3) as id`, [special, slot, issue])
    const p = await pay(b!.id, fresh)
    await webhook(p.id, `evt-c-${b!.id}`, { amount: 100000 })
    const [row] = await q<{ commission_minor: string; commission_rate_bps: number }>(db, 'service', `select commission_minor, commission_rate_bps from public.payments where id = $1`, [p.id])
    expect(row!.commission_rate_bps).toBe(1000)
    expect(Number(row!.commission_minor)).toBe(10000)
    // Changing the rule later does not alter the snapshot.
    await db.query(`update public.commission_rules set rate_bps = 3000 where lawyer_id = $1`, [special])
    await expect(db.query(`update public.payments set commission_minor = 1 where id = $1`, [p.id])).rejects.toThrow(/immutable/)
  })
})

describe('ledger integrity', () => {
  it('is append-only and rejects unbalanced transactions', async () => {
    await expect(db.query(`update public.financial_ledger_entries set memo = 'x'`)).rejects.toThrow(/append-only/)
    await expect(db.query(`delete from public.financial_ledger_entries`)).rejects.toThrow(/append-only/)
    await expect(
      db.transaction(async (tx) => {
        await tx.query(`insert into public.financial_ledger_entries (txn_id, entry_type, account, debit_minor) values (gen_random_uuid(), 'adjustment', 'platform_revenue', 100)`)
      }),
    ).rejects.toThrow(/Unbalanced/)
  })
})

describe('settlements', () => {
  it('pays out exactly the ledger balance and records the payout', async () => {
    await db.query(`insert into public.settlement_accounts (lawyer_id, method, account_holder_name, account_identifier) values ($1, 'bank_transfer', 'Test Lawyer', 'EG380019000500000000263180002')`, [lawyer])
    const [bal] = await q<{ b: string }>(db, 'service', `select app.beneficiary_balance_minor($1, null) b`, [lawyer])
    const balance = Number(bal!.b)
    expect(balance).toBeGreaterThan(0)
    const [req] = await q<{ id: string }>(db, { id: lawyer }, `select public.request_payout($1) id`, [balance])
    expect(await fails(db, { id: lawyer }, `select public.request_payout($1)`, [60000])).toMatch(/exceeds available balance/)
    const [s] = await q<{ id: string }>(db, { id: admin },
      `select public.admin_create_settlement($1, null, current_date - 30, current_date, $2) id`, [lawyer, req!.id])
    await q(db, { id: admin }, `select public.admin_mark_settlement_paid($1, 'BANK-REF-001')`, [s!.id])
    const [after] = await q<{ b: string }>(db, 'service', `select app.beneficiary_balance_minor($1, null) b`, [lawyer])
    expect(Number(after!.b)).toBe(0)
    const [pr] = await q<{ status: string }>(db, { id: lawyer }, `select status from public.payout_requests where id = $1`, [req!.id])
    expect(pr!.status).toBe('paid')
    const total = await ledgerBalance()
    expect(total.debit).toBe(total.credit)
  })
})
