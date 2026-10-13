import { beforeAll, describe, expect, it } from 'vitest'
import { createPublishedLawyer, createTestDb, createUser, fails, q, type Db } from '../helpers/db'

let db: Db
let lawyer: string
let admin: string
let support: string

beforeAll(async () => {
  db = await createTestDb()
  lawyer = await createPublishedLawyer(db)
  admin = await createUser(db, { roles: ['admin'] })
  support = await createUser(db, { roles: ['support'] })
})

describe('service moderation', () => {
  let service: string
  beforeAll(async () => {
    const [s] = await q<{ id: string }>(db, { id: lawyer },
      `insert into public.legal_services (slug, lawyer_id, title_ar, description_ar, price_minor, estimated_days, status, deliverables)
       values ('moderation-test', $1, 'صياغة إنذار رسمي', 'صياغة إنذار على يد محضر مع مراجعة المستندات المرفقة.', 90000, 2, 'pending_review', array['مسودة الإنذار'])
       returning id`, [lawyer])
    service = s!.id
  })

  it('lets admins activate, audits and notifies the lawyer', async () => {
    await q(db, { id: admin }, `select public.admin_moderate_service($1, 'active', '')`, [service])
    const [s] = await q<{ status: string }>(db, 'service', `select status from public.legal_services where id = $1`, [service])
    expect(s!.status).toBe('active')
    const audit = await q(db, 'service', `select 1 from public.audit_logs where action = 'service.moderated' and entity_id = $1`, [service])
    expect(audit).toHaveLength(1)
    const n = await q(db, { id: lawyer }, `select 1 from public.notifications where event_type = 'service.moderated'`)
    expect(n.length).toBeGreaterThan(0)
  })

  it('requires a reason to suspend and rejects non-admins', async () => {
    expect(await fails(db, { id: admin }, `select public.admin_moderate_service($1, 'suspended', ' ')`, [service])).toMatch(/reason/)
    expect(await fails(db, { id: support }, `select public.admin_moderate_service($1, 'suspended', 'x')`, [service])).toMatch(/Admin/)
    expect(await fails(db, { id: lawyer }, `select public.admin_moderate_service($1, 'active', 'x')`, [service])).toMatch(/Admin/)
    await q(db, { id: admin }, `select public.admin_moderate_service($1, 'suspended', 'وصف مضلل للخدمة')`, [service])
    // Lawyer cannot lift a suspension.
    expect(await fails(db, { id: lawyer }, `update public.legal_services set status = 'pending_review' where id = $1`, [service])).toMatch(/platform/)
  })
})

describe('invoice notification', () => {
  it('notifies the bill-to user when an invoice is issued', async () => {
    const client = await createUser(db)
    const [inv] = await q<{ id: string }>(db, 'service',
      `insert into public.invoices (issuer_lawyer_id, bill_to_user_id, bill_to_name, status, subtotal_minor, total_minor)
       values ($1, $2, 'عميل', 'draft', 1000, 1000) returning id`, [lawyer, client])
    expect(await q(db, { id: client }, `select 1 from public.notifications where event_type = 'invoice.issued'`)).toHaveLength(0)
    await db.query(`update public.invoices set status = 'issued', issued_at = now() where id = $1`, [inv!.id])
    await db.query(`update public.invoices set notes = 'x' where id = $1`, [inv!.id])
    expect(await q(db, { id: client }, `select 1 from public.notifications where event_type = 'invoice.issued'`)).toHaveLength(1)
  })
})

describe('stale upload cleanup', () => {
  it('is service-role only and removes abandoned versions', async () => {
    const user = await createUser(db)
    const [r] = await q<{ r: { document_id: string } }>(db, { id: user },
      `select public.create_document_upload('عقد', 'contract', 'contract.pdf', 'application/pdf', 1000) as r`)
    const docId = r!.r.document_id
    await db.query(`update public.document_versions set created_at = now() - interval '2 days' where document_id = $1`, [docId])
    expect(await fails(db, { id: user }, `select * from public.claim_stale_uploads()`)).toMatch(/permission denied/)
    const rows = await q<{ document_id: string; storage_path: string }>(db, 'service', `select * from public.claim_stale_uploads()`)
    expect(rows.map((x) => x.document_id)).toContain(docId)
    const [d] = await q<{ status: string }>(db, 'service', `select status from public.documents where id = $1`, [docId])
    expect(d!.status).toBe('deleted')
  })
})

describe('payout rejection', () => {
  it('requires admin and a reason; only pending requests', async () => {
    const [p] = await q<{ id: string }>(db, 'service',
      `insert into public.payout_requests (lawyer_id, amount_minor, requested_by) values ($1, 5000, $1) returning id`, [lawyer])
    expect(await fails(db, { id: lawyer }, `select public.admin_reject_payout($1, 'x')`, [p!.id])).toMatch(/Admin/)
    expect(await fails(db, { id: admin }, `select public.admin_reject_payout($1, '')`, [p!.id])).toMatch(/reason/)
    await q(db, { id: admin }, `select public.admin_reject_payout($1, 'بيانات الحساب غير مطابقة')`, [p!.id])
    expect(await fails(db, { id: admin }, `select public.admin_reject_payout($1, 'again')`, [p!.id])).toMatch(/not pending/)
    expect(await q(db, { id: lawyer }, `select 1 from public.notifications where event_type = 'payout.rejected'`)).toHaveLength(1)
  })
})

describe('beneficiary balances', () => {
  it('is admin-only', async () => {
    expect(await fails(db, { id: lawyer }, `select * from public.admin_beneficiary_balances()`)).toMatch(/Admin/)
    const rows = await q(db, { id: admin }, `select * from public.admin_beneficiary_balances()`)
    expect(Array.isArray(rows)).toBe(true)
  })
})
