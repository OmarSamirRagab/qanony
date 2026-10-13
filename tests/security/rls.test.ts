/**
 * Security tests: data isolation between clients, lawyers and firms; staff
 * permission enforcement; verification integrity; private file access.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createPublishedLawyer, createTestDb, createUser, fails, nextSlot, q, type Db } from '../helpers/db'

let db: Db
let lawyerA: string
let lawyerB: string
let clientA: string
let clientB: string
let support: string
let admin: string
let apptA: string

const issue = 'أريد معرفة الإجراءات اللازمة لاسترداد مبلغ تأمين الإيجار.'

async function giveFirmPlan(firmId: string) {
  await db.query(
    `insert into public.subscriptions (plan_id, firm_id, status, current_period_end)
     select id, $1, 'active', now() + interval '30 days' from public.subscription_plans where code = 'law_firm'`, [firmId])
}

async function uploadDoc(owner: string, args: { matter?: string; appointment?: string; firm?: string; title?: string; share?: boolean } = {}) {
  const [r] = await q<{ r: { document_id: string; version: number } }>(
    db, { id: owner },
    `select public.create_document_upload($1, 'contract', 'contract.pdf', 'application/pdf', 1024, $2, $3, null, $4, null, $5) as r`,
    [args.title ?? 'عقد', args.matter ?? null, args.appointment ?? null, args.firm ?? null, args.share ?? false],
  )
  await q(db, 'service', `select public.mark_document_uploaded($1, $2, 1024, 'abc', 'clean')`, [r!.r.document_id, r!.r.version])
  return r!.r.document_id
}

beforeAll(async () => {
  db = await createTestDb()
  lawyerA = await createPublishedLawyer(db)
  lawyerB = await createPublishedLawyer(db)
  clientA = await createUser(db, { name: 'Client A' })
  clientB = await createUser(db, { name: 'Client B' })
  support = await createUser(db, { roles: ['support'] })
  admin = await createUser(db, { roles: ['admin'] })
  const slot = await nextSlot(db, lawyerA, 'text', 2)
  apptA = (await q<{ id: string }>(db, { id: clientA }, `select public.book_appointment($1, 'text', $2::timestamptz, $3) as id`, [lawyerA, slot, issue]))[0]!.id
})

describe('client isolation', () => {
  it('clients cannot read other clients’ appointments, messages or profiles', async () => {
    expect(await q(db, { id: clientB }, `select * from public.appointments where id = $1`, [apptA])).toHaveLength(0)
    const conv = (await q<{ id: string }>(db, { id: clientA }, `select id from public.conversations where appointment_id = $1`, [apptA]))[0]!.id
    await q(db, { id: clientA }, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'مرحبا')`, [conv, clientA])
    expect(await q(db, { id: clientB }, `select * from public.messages where conversation_id = $1`, [conv])).toHaveLength(0)
    expect(await q(db, { id: clientB }, `select * from public.profiles where id = $1`, [clientA])).toHaveLength(0)
    const err = await fails(db, { id: clientB }, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conv, clientB])
    expect(err).toMatch(/row-level security/)
  })

  it('unrelated lawyers cannot see the appointment or conversation', async () => {
    expect(await q(db, { id: lawyerB }, `select * from public.appointments where id = $1`, [apptA])).toHaveLength(0)
    expect(await q(db, { id: lawyerB }, `select * from public.conversations where appointment_id = $1`, [apptA])).toHaveLength(0)
  })

  it('cannot spoof the sender of a message', async () => {
    const conv = (await q<{ id: string }>(db, { id: clientA }, `select id from public.conversations where appointment_id = $1`, [apptA]))[0]!.id
    const err = await fails(db, { id: clientA }, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')`, [conv, lawyerA])
    expect(err).toMatch(/row-level security/)
  })

  it('anonymous users only see public lawyer data', async () => {
    const rows = await q<{ id: string }>(db, 'anon', `select id from public.lawyer_profiles`)
    expect(rows.map((r) => r.id).sort()).toEqual([lawyerA, lawyerB].sort())
    expect(await q(db, 'anon', `select * from public.lawyer_private_details`)).toHaveLength(0)
    expect(await q(db, 'anon', `select * from public.appointments`)).toHaveLength(0)
    expect(await q(db, 'anon', `select * from public.lawyer_availability_exceptions`)).toHaveLength(0)
    expect(await fails(db, 'anon', `select public.book_appointment($1, 'text', now(), 'x')`, [lawyerA])).toMatch(/permission denied/)
  })
})

describe('lawyer verification integrity', () => {
  it('unverified lawyers cannot self-verify, publish, feature themselves or fake ratings', async () => {
    const newbie = await createUser(db, { type: 'lawyer' })
    await q(db, { id: newbie }, `update public.lawyer_profiles set title_ar = 'محامٍ بالنقض' where id = $1`, [newbie])
    for (const sql of [
      `update public.lawyer_profiles set verification_status = 'verified' where id = $1`,
      `update public.lawyer_profiles set is_published = true where id = $1`,
      `update public.lawyer_profiles set is_featured = true where id = $1`,
      `update public.lawyer_profiles set rating_avg = 5, rating_count = 100 where id = $1`,
      `update public.lawyer_profiles set bar_number_public = '12345' where id = $1`,
    ]) {
      expect(await fails(db, { id: newbie }, sql, [newbie])).toMatch(/platform|verification/)
    }
    const [l] = await q<{ verification_status: string; is_published: boolean }>(db, 'service', `select verification_status, is_published from public.lawyer_profiles where id = $1`, [newbie])
    expect(l).toEqual({ verification_status: 'unverified', is_published: false })
    expect(await q(db, 'anon', `select id from public.lawyer_profiles where id = $1`, [newbie])).toHaveLength(0)
  })

  it('cannot mark own credentials verified', async () => {
    const newbie = await createUser(db, { type: 'lawyer' })
    const [c] = await q<{ id: string; is_verified: boolean }>(db, { id: newbie },
      `insert into public.lawyer_credentials (lawyer_id, kind, title, is_verified) values ($1, 'bar_card', 'كارنيه النقابة', true) returning id, is_verified`, [newbie])
    expect(c!.is_verified).toBe(false)
    expect(await fails(db, { id: newbie }, `update public.lawyer_credentials set is_verified = true where id = $1`, [c!.id])).toMatch(/platform/)
  })

  it('full verification workflow: submit → admin approves with reason → lawyer can publish', async () => {
    const lawyer = await createUser(db, { type: 'lawyer' })
    const docId = await uploadDoc(lawyer, { title: 'كارنيه النقابة' })
    await db.query(`update public.documents set category = 'credential' where id = $1`, [docId])
    const [cred] = await q<{ id: string }>(db, { id: lawyer },
      `insert into public.lawyer_credentials (lawyer_id, kind, title, document_id) values ($1, 'bar_card', 'قيد استئناف', $2) returning id`, [lawyer, docId])
    const [req] = await q<{ id: string }>(db, { id: lawyer }, `select public.submit_lawyer_verification('A-12345', 'مرفق الكارنيه', array[$1]::uuid[]) as id`, [cred!.id])
    // Non-admins cannot review.
    expect(await fails(db, { id: support }, `select public.review_lawyer_verification($1, true, 'ok')`, [req!.id])).toMatch(/Admin access/)
    // Admin can read the credential document for review, support cannot.
    expect(await q(db, { id: admin }, `select id from public.documents where id = $1`, [docId])).toHaveLength(1)
    expect(await q(db, { id: support }, `select id from public.documents where id = $1`, [docId])).toHaveLength(0)
    expect(await fails(db, { id: admin }, `select public.review_lawyer_verification($1, true, '')`, [req!.id])).toMatch(/reason/)
    await q(db, { id: admin }, `select public.review_lawyer_verification($1, true, 'تمت مطابقة بيانات القيد')`, [req!.id])
    await q(db, { id: lawyer }, `update public.lawyer_profiles set is_published = true where id = $1`, [lawyer])
    expect(await q(db, 'anon', `select id from public.lawyer_profiles where id = $1`, [lawyer])).toHaveLength(1)
    const audit = await q(db, { id: admin }, `select * from public.audit_logs where action = 'verification.approved' and entity_id = $1`, [req!.id])
    expect(audit).toHaveLength(1)
  })
})

describe('documents', () => {
  it('private files are only authorised for permitted users', async () => {
    const docId = await uploadDoc(clientA, { appointment: apptA, title: 'صورة العقد' })
    // Owner and the appointment's lawyer can download.
    expect((await q<{ r: { path: string } }>(db, { id: clientA }, `select public.authorize_document_download($1) as r`, [docId]))[0]!.r.path).toContain(docId)
    expect((await q(db, { id: lawyerA }, `select public.authorize_document_download($1) as r`, [docId]))).toHaveLength(1)
    // Everyone else is refused — including support staff and admins.
    for (const user of [clientB, lawyerB, support, admin]) {
      expect(await fails(db, { id: user }, `select public.authorize_document_download($1)`, [docId])).toMatch(/Not allowed/)
      expect(await q(db, { id: user }, `select id from public.documents where id = $1`, [docId])).toHaveLength(0)
      expect(await q(db, { id: user }, `select storage_path from public.document_versions where document_id = $1`, [docId])).toHaveLength(0)
    }
    expect(await fails(db, 'anon', `select public.authorize_document_download($1)`, [docId])).toMatch(/permission denied/)
    // Downloads are logged.
    const log = await q(db, { id: clientA }, `select * from public.document_access_log where document_id = $1 and action = 'download'`, [docId])
    expect(log.length).toBeGreaterThanOrEqual(2)
  })

  it('expired grants stop working; storage objects in the private bucket are not readable directly', async () => {
    const docId = await uploadDoc(clientA, { title: 'مستند خاص' })
    await q(db, { id: clientA }, `insert into public.document_access_grants (document_id, grantee_id, granted_by, expires_at) values ($1, $2, $3, now() - interval '1 minute')`, [docId, clientB, clientA])
    expect(await fails(db, { id: clientB }, `select public.authorize_document_download($1)`, [docId])).toMatch(/Not allowed/)
    await db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${docId}/v1-x-contract.pdf`])
    expect(await q(db, { id: clientA }, `select * from storage.objects where bucket_id = 'documents'`)).toHaveLength(0)
    expect(await q(db, 'anon', `select * from storage.objects where bucket_id = 'documents'`)).toHaveLength(0)
  })

  it('users cannot forge upload state or scan results', async () => {
    const docId = await uploadDoc(clientA)
    expect(await fails(db, { id: clientA }, `update public.documents set scan_status = 'clean', current_version = 9 where id = $1`, [docId])).toMatch(/managed by the platform/)
    expect(await fails(db, { id: clientA }, `select public.mark_document_uploaded($1, 1, 1, 'x', 'clean')`, [docId])).toMatch(/permission denied/)
  })

  it('rejects disallowed file types and sizes', async () => {
    expect(await fails(db, { id: clientA },
      `select public.create_document_upload('x', 'other', 'evil.exe', 'application/x-msdownload', 100)`)).toMatch(/not allowed/)
    expect(await fails(db, { id: clientA },
      `select public.create_document_upload('x', 'other', 'big.pdf', 'application/pdf', 999999999)`)).toMatch(/not allowed/)
  })
})

describe('law firms: tenant isolation and staff permissions', () => {
  let firm1: string
  let firm2: string
  let owner1: string
  let owner2: string
  let staffViewer: string
  let staffNoAccess: string
  let matter1: string

  beforeAll(async () => {
    owner1 = await createUser(db, { type: 'lawyer', email: 'owner1@firm.test' })
    owner2 = await createUser(db, { type: 'lawyer', email: 'owner2@firm.test' })
    firm1 = (await q<{ id: string }>(db, { id: owner1 }, `select public.create_law_firm('مكتب الأمل للمحاماة', 'Al Amal Law', 'al-amal', null, null) as id`))[0]!.id
    firm2 = (await q<{ id: string }>(db, { id: owner2 }, `select public.create_law_firm('مكتب العدل', 'Al Adl', 'al-adl', null, null) as id`))[0]!.id
    await giveFirmPlan(firm1)
    await giveFirmPlan(firm2)
    staffViewer = await createUser(db, { email: 'viewer@firm.test' })
    staffNoAccess = await createUser(db, { email: 'noaccess@firm.test' })
    const paralegal = (await q<{ id: string }>(db, { id: owner1 }, `select id from public.law_firm_roles where firm_id = $1 and name = 'Paralegal'`, [firm1]))[0]!.id
    const accountant = (await q<{ id: string }>(db, { id: owner1 }, `select id from public.law_firm_roles where firm_id = $1 and name = 'Accountant'`, [firm1]))[0]!.id
    for (const [email, role, user] of [['viewer@firm.test', paralegal, staffViewer], ['noaccess@firm.test', accountant, staffNoAccess]] as const) {
      const [m] = await q<{ id: string }>(db, { id: owner1 }, `select public.invite_firm_member($1, $2, 'staff', $3) as id`, [firm1, email, role])
      await q(db, { id: user }, `select public.respond_firm_invitation($1, true)`, [m!.id])
    }
    const [pc] = await q<{ id: string }>(db, { id: owner1 },
      `insert into public.practice_clients (firm_id, full_name, phone, created_by) values ($1, 'شركة النيل للتجارة', '01000000000', $2) returning id`, [firm1, owner1])
    matter1 = (await q<{ id: string }>(db, { id: owner1 },
      `insert into public.legal_matters (firm_id, owner_lawyer_id, client_record_id, title, created_by) values ($1, $2, $3, 'نزاع توريد', $2) returning id`,
      [firm1, owner1, pc!.id]))[0]!.id
  })

  it('firms cannot see each other’s matters, clients or documents', async () => {
    const doc = await uploadDoc(owner1, { matter: matter1, title: 'مذكرة دفاع' })
    expect(await q(db, { id: owner2 }, `select * from public.legal_matters where id = $1`, [matter1])).toHaveLength(0)
    expect(await q(db, { id: owner2 }, `select * from public.practice_clients where firm_id = $1`, [firm1])).toHaveLength(0)
    expect(await q(db, { id: owner2 }, `select * from public.documents where id = $1`, [doc])).toHaveLength(0)
    expect(await fails(db, { id: owner2 }, `select public.authorize_document_download($1)`, [doc])).toMatch(/Not allowed/)
    expect(await q(db, { id: owner2 }, `select * from public.law_firm_members where firm_id = $1`, [firm1])).toHaveLength(0)
  })

  it('staff permissions are enforced per role', async () => {
    // Paralegal: matters.view + documents.view/upload, no edit
    expect(await q(db, { id: staffViewer }, `select id from public.legal_matters where id = $1`, [matter1])).toHaveLength(1)
    await q(db, { id: staffViewer }, `update public.legal_matters set title = 'تعديل' where id = $1`, [matter1])
    expect((await q<{ title: string }>(db, 'service', `select title from public.legal_matters where id = $1`, [matter1]))[0]!.title).toBe('نزاع توريد')
    // Accountant: no matter access, but financial reporting
    expect(await q(db, { id: staffNoAccess }, `select id from public.legal_matters where id = $1`, [matter1])).toHaveLength(0)
    const [perms] = await q<{ p: string[] }>(db, { id: staffNoAccess }, `select public.my_firm_permissions($1) as p`, [firm1])
    expect(perms!.p).toContain('reports.financial')
    expect(perms!.p).not.toContain('matters.view')
    // Staff cannot manage members or escalate themselves.
    expect(await fails(db, { id: staffViewer }, `select public.invite_firm_member($1, 'x@y.test', 'staff', null)`, [firm1])).toMatch(/Not allowed/)
    const [member] = await q<{ id: string }>(db, { id: staffViewer }, `select id from public.law_firm_members where user_id = $1`, [staffViewer])
    expect(await fails(db, { id: staffViewer },
      `insert into public.law_firm_member_permissions (member_id, permission) values ($1, 'matters.edit')`, [member!.id])).toMatch(/row-level security/)
  })

  it('per-member overrides grant and revoke on top of the role', async () => {
    const [member] = await q<{ id: string }>(db, { id: owner1 }, `select id from public.law_firm_members where user_id = $1 and firm_id = $2`, [staffViewer, firm1])
    await q(db, { id: owner1 }, `insert into public.law_firm_member_permissions (member_id, permission, granted) values ($1, 'matters.edit', true)`, [member!.id])
    await q(db, { id: staffViewer }, `update public.legal_matters set priority = 'high' where id = $1`, [matter1])
    expect((await q<{ priority: string }>(db, 'service', `select priority from public.legal_matters where id = $1`, [matter1]))[0]!.priority).toBe('high')
    await q(db, { id: owner1 }, `insert into public.law_firm_member_permissions (member_id, permission, granted) values ($1, 'matters.view', false)`, [member!.id])
    expect(await q(db, { id: staffViewer }, `select id from public.legal_matters where id = $1`, [matter1])).toHaveLength(0)
    await q(db, { id: owner1 }, `delete from public.law_firm_member_permissions where member_id = $1`, [member!.id])
  })

  it('matters can only be assigned to members of the same firm', async () => {
    expect(await fails(db, { id: owner1 },
      `insert into public.matter_members (matter_id, user_id, role) values ($1, $2, 'associate')`, [matter1, owner2])).toMatch(/member of the firm/)
    await q(db, { id: owner1 }, `insert into public.matter_members (matter_id, user_id, role, can_edit) values ($1, $2, 'staff', false)`, [matter1, staffNoAccess])
    // Now the accountant sees this matter (explicit assignment) but still cannot edit it.
    expect(await q(db, { id: staffNoAccess }, `select id from public.legal_matters where id = $1`, [matter1])).toHaveLength(1)
    const notif = await q(db, { id: staffNoAccess }, `select * from public.notifications where event_type = 'matter.assigned'`)
    expect(notif).toHaveLength(1)
  })

  it('removed members immediately lose access', async () => {
    const [member] = await q<{ id: string }>(db, { id: owner1 }, `select id from public.law_firm_members where user_id = $1 and firm_id = $2`, [staffViewer, firm1])
    await q(db, { id: owner1 }, `select public.update_firm_member($1, null, 'removed', null, null, null)`, [member!.id])
    expect(await q(db, { id: staffViewer }, `select id from public.legal_matters where id = $1`, [matter1])).toHaveLength(0)
  })

  it('seat limits come from the firm plan', async () => {
    await db.query(`update public.plan_features set limit_value = 1 where feature_key = 'firm.staff' and plan_id = (select id from public.subscription_plans where code = 'law_firm')`)
    try {
      expect(await fails(db, { id: owner1 }, `select public.invite_firm_member($1, 'third@firm.test', 'staff', null)`, [firm1])).toMatch(/seat limit/)
    } finally {
      await db.query(`update public.plan_features set limit_value = 10 where feature_key = 'firm.staff' and plan_id = (select id from public.subscription_plans where code = 'law_firm')`)
    }
  })
})

describe('matters & clients', () => {
  it('clients only see shared notes, events and documents of their own matters', async () => {
    const slot = await nextSlot(db, lawyerA, 'text', 3)
    const appt = (await q<{ id: string }>(db, { id: clientB }, `select public.book_appointment($1, 'text', $2::timestamptz, $3) as id`, [lawyerA, slot, issue]))[0]!.id
    const [m] = await q<{ id: string }>(db, { id: lawyerA }, `select public.create_matter_from_appointment($1, 'استرداد التأمين') as id`, [appt])
    const matter = m!.id
    await q(db, { id: lawyerA }, `insert into public.matter_notes (matter_id, author_id, body, visibility) values ($1, $2, 'ملاحظة داخلية سرية', 'private'), ($1, $2, 'تحديث للعميل', 'shared')`, [matter, lawyerA])
    const internalDoc = await uploadDoc(lawyerA, { matter, title: 'تحليل داخلي' })
    const sharedDoc = await uploadDoc(lawyerA, { matter, title: 'نسخة الإنذار', share: true })

    const notes = await q<{ body: string }>(db, { id: clientB }, `select body from public.matter_notes where matter_id = $1`, [matter])
    expect(notes.map((n) => n.body)).toEqual(['تحديث للعميل'])
    expect(await q(db, { id: clientB }, `select id from public.documents where id = $1`, [internalDoc])).toHaveLength(0)
    expect(await q(db, { id: clientB }, `select id from public.documents where id = $1`, [sharedDoc])).toHaveLength(1)
    expect(await q(db, { id: clientA }, `select id from public.legal_matters where id = $1`, [matter])).toHaveLength(0)
    expect(await q(db, { id: lawyerB }, `select id from public.legal_matters where id = $1`, [matter])).toHaveLength(0)
    // Clients cannot change matter status.
    await q(db, { id: clientB }, `update public.legal_matters set status = 'CLOSED' where id = $1`, [matter])
    expect((await q<{ status: string }>(db, 'service', `select status from public.legal_matters where id = $1`, [matter]))[0]!.status).toBe('NEW')
    // Invalid transitions are rejected even for the owner.
    expect(await fails(db, { id: lawyerA }, `update public.legal_matters set status = 'ARCHIVED' where id = $1`, [matter])).toMatch(/Invalid matter transition/)
    await q(db, { id: lawyerA }, `update public.legal_matters set status = 'ACTIVE' where id = $1`, [matter])
    const events = await q<{ event_type: string }>(db, { id: clientB }, `select event_type from public.matter_events where matter_id = $1`, [matter])
    expect(events.map((e) => e.event_type)).toContain('matter.status_changed')
  })

  it('appointment notes stay private unless shared', async () => {
    await q(db, { id: lawyerA }, `insert into public.appointment_notes (appointment_id, author_id, body) values ($1, $2, 'انطباع خاص')`, [apptA, lawyerA])
    await q(db, { id: lawyerA }, `insert into public.appointment_notes (appointment_id, author_id, body, shared_with_client) values ($1, $2, 'ملخص للعميل', true)`, [apptA, lawyerA])
    const seen = await q<{ body: string }>(db, { id: clientA }, `select body from public.appointment_notes where appointment_id = $1`, [apptA])
    expect(seen.map((n) => n.body)).toEqual(['ملخص للعميل'])
    expect(await fails(db, { id: clientA }, `insert into public.appointment_notes (appointment_id, author_id, body) values ($1, $2, 'x')`, [apptA, clientA])).toMatch(/row-level security/)
  })
})

describe('platform roles', () => {
  it('support cannot read messages, documents or payments; admins cannot grant super-admin', async () => {
    expect(await q(db, { id: support }, `select * from public.messages`)).toHaveLength(0)
    expect(await q(db, { id: support }, `select * from public.payments`)).toHaveLength(0)
    expect(await q(db, { id: support }, `select * from public.appointments where id = $1`, [apptA])).toHaveLength(1) // operational metadata
    expect(await fails(db, { id: admin }, `select public.admin_set_role($1, 'super_admin', true)`, [admin])).toMatch(/super admins/)
    expect(await fails(db, { id: clientA }, `select public.admin_set_role($1, 'admin', true)`, [clientA])).toMatch(/super admins/)
    expect(await fails(db, { id: clientA }, `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [clientA])).toMatch(/row-level security/)
  })

  it('suspended users lose access and unpublish', async () => {
    const lawyer = await createPublishedLawyer(db)
    await q(db, { id: admin }, `select public.admin_set_account_status($1, 'suspended', 'شكاوى متكررة')`, [lawyer])
    expect(await q(db, 'anon', `select id from public.lawyer_profiles where id = $1`, [lawyer])).toHaveLength(0)
    expect(await fails(db, { id: lawyer }, `select public.create_document_upload('x', 'other', 'a.pdf', 'application/pdf', 10)`)).toMatch(/not active/)
    expect(await fails(db, { id: lawyer }, `update public.profiles set status = 'active' where id = $1`, [lawyer])).toMatch(/Not allowed/)
  })

  it('service-role-only RPCs are not callable by users', async () => {
    for (const sql of [
      `select public.expire_stale_appointments()`,
      `select public.claim_refunds(1)`,
      `select * from public.claim_notification_deliveries(1)`,
      `select public.process_subscription_renewals()`,
    ]) {
      expect(await fails(db, { id: admin }, sql)).toMatch(/permission denied/)
    }
  })

  it('internal app.* helpers with side effects are not callable by users', async () => {
    expect(await fails(db, { id: clientA }, `select app.notify($1, 'x')`, [clientB])).toMatch(/permission denied/)
    expect(await fails(db, { id: clientA }, `select app.create_refund(gen_random_uuid(), 1, 'x', null, '{}')`)).toMatch(/permission denied/)
  })
})

describe('profile visibility', () => {
  it('related parties can see each other; strangers cannot', async () => {
    const lawyer = await createPublishedLawyer(db)
    const client = await createUser(db, { name: 'عميل مرتبط' })
    const stranger = await createUser(db)
    const slot = await nextSlot(db, lawyer, 'text', 2)
    await q(db, { id: client }, `select public.book_appointment($1, 'text', $2::timestamptz, $3)`, [lawyer, slot, issue])
    expect(await q(db, { id: lawyer }, `select full_name from public.profiles where id = $1`, [client])).toHaveLength(1)
    expect(await q(db, { id: client }, `select full_name from public.profiles where id = $1`, [lawyer])).toHaveLength(1)
    expect(await q(db, { id: stranger }, `select full_name from public.profiles where id = $1`, [client])).toHaveLength(0)
    expect(await q(db, { id: lawyerB }, `select full_name from public.profiles where id = $1`, [client])).toHaveLength(0)
  })
})

describe('admin user directory', () => {
  it('is available to support/admin and refused to everyone else', async () => {
    const rows = await q<{ email: string; total_count: string }>(db, { id: support }, `select * from public.admin_list_users(null, null, null, 5, 0)`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.email).toContain('@')
    expect(await fails(db, { id: clientA }, `select * from public.admin_list_users()`)).toMatch(/Not allowed/)
    expect(await fails(db, { id: lawyerA }, `select * from public.admin_list_users()`)).toMatch(/Not allowed/)
  })
})
