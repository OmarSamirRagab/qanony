'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { findWindowProblems } from '@/lib/domain/availability'
import { toMinor } from '@/lib/domain/money'
import { invoiceTotals } from '@/lib/domain/invoice'
import { createClient } from '@/lib/supabase/server'
import type { Enums, TablesInsert } from '@/types/database'

async function me() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, uid: data.user?.id ?? null }
}

// ---------------------------------------------------------------- profile
const profileSchema = z.object({
  displayNameAr: z.string().trim().min(3, 'tooShort').max(120),
  displayNameEn: z.string().trim().max(120).optional(),
  titleAr: z.string().trim().max(160).optional(),
  titleEn: z.string().trim().max(160).optional(),
  bioAr: z.string().trim().max(5000, 'tooLong').optional(),
  bioEn: z.string().trim().max(5000, 'tooLong').optional(),
  photoUrl: z.union([z.url(), z.literal('')]).optional(),
  gender: z.enum(['male', 'female']).nullable(),
  yearsExperience: z.number().int().min(0).max(70),
  barLevel: z.enum(['general', 'primary', 'appeal', 'cassation']).nullable(),
  showBarNumber: z.boolean(),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(6),
  governorateId: z.number().int().positive().nullable(),
  cityId: z.number().int().positive().nullable(),
  education: z.array(z.object({ degree: z.string().trim().max(160), institution: z.string().trim().max(160), year: z.number().int().min(1950).max(2100).nullable() })).max(10),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/, 'invalidSlug'),
  aiEnabled: z.boolean(),
})

export async function saveLawyerProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const v = validate(profileSchema, input)
  if ('result' in v) return v.result
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase
    .from('lawyer_profiles')
    .update({
      display_name_ar: v.data.displayNameAr,
      display_name_en: v.data.displayNameEn || null,
      title_ar: v.data.titleAr || null,
      title_en: v.data.titleEn || null,
      bio_ar: v.data.bioAr || null,
      bio_en: v.data.bioEn || null,
      photo_url: v.data.photoUrl || null,
      gender: v.data.gender,
      years_experience: v.data.yearsExperience,
      bar_admission_level: v.data.barLevel,
      show_bar_number: v.data.showBarNumber,
      languages: v.data.languages,
      governorate_id: v.data.governorateId,
      city_id: v.data.cityId,
      education: v.data.education,
      slug: v.data.slug,
      ai_enabled: v.data.aiEnabled,
    })
    .eq('id', uid)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/profile')
  return ok()
}

export async function saveSpecializations(items: { categoryId: string; primary: boolean }[]): Promise<ActionResult> {
  const parsed = z.array(z.object({ categoryId: z.uuid(), primary: z.boolean() })).max(6).safeParse(items)
  if (!parsed.success) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error: dErr } = await supabase.from('lawyer_specializations').delete().eq('lawyer_id', uid)
  if (dErr) return fromDb(dErr)
  if (parsed.data.length) {
    const { error } = await supabase.from('lawyer_specializations').insert(parsed.data.map((s) => ({ lawyer_id: uid, category_id: s.categoryId, is_primary: s.primary })))
    if (error) return fromDb(error)
  }
  revalidatePath('/lawyer/profile')
  return ok()
}

export async function saveOfferings(items: { type: Enums<'consultation_kind'>; enabled: boolean; price: number; duration: number }[]): Promise<ActionResult> {
  const parsed = z
    .array(z.object({ type: z.enum(['video', 'voice', 'text', 'in_person', 'written_opinion']), enabled: z.boolean(), price: z.number().min(0).max(1_000_000), duration: z.number().int().min(10).max(240) }))
    .safeParse(items)
  if (!parsed.success) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const rows = parsed.data.map((o) => ({ lawyer_id: uid, consultation_type: o.type, price_minor: toMinor(o.price), duration_minutes: o.duration, is_active: o.enabled }))
  const { error } = await supabase.from('lawyer_consultation_offerings').upsert(rows, { onConflict: 'lawyer_id,consultation_type' })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/profile')
  return ok()
}

export async function saveOffice(input: { id?: string; label: string; addressAr: string; addressEn?: string; mapUrl?: string }): Promise<ActionResult> {
  const parsed = z.object({ label: z.string().trim().min(2).max(80), addressAr: z.string().trim().min(5).max(300), mapUrl: z.union([z.url(), z.literal('')]).optional() }).safeParse(input)
  if (!parsed.success) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const row = { lawyer_id: uid, label: input.label, address_ar: input.addressAr, address_en: input.addressEn || null, map_url: input.mapUrl || null }
  const { error } = input.id ? await supabase.from('lawyer_offices').update(row).eq('id', input.id) : await supabase.from('lawyer_offices').insert(row)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/profile')
  return ok()
}

export async function deleteOffice(id: string): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.from('lawyer_offices').update({ is_active: false }).eq('id', id)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/profile')
  return ok()
}

export async function setPublished(published: boolean): Promise<ActionResult> {
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase.from('lawyer_profiles').update({ is_published: published }).eq('id', uid)
  if (error) return fromDb(error)
  revalidatePath('/lawyer')
  return ok()
}

// ---------------------------------------------------------------- availability
const windowSchema = z.object({ weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) })

export async function saveWeeklyAvailability(windows: z.input<typeof windowSchema>[]): Promise<ActionResult> {
  const parsed = z.array(windowSchema).max(42).safeParse(windows)
  if (!parsed.success) return fail('required')
  const problems = findWindowProblems(parsed.data)
  if (problems.length) return { ok: false, error: 'required', detail: problems.join(', ') }
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error: dErr } = await supabase.from('lawyer_availability').delete().eq('lawyer_id', uid)
  if (dErr) return fromDb(dErr)
  if (parsed.data.length) {
    const { error } = await supabase.from('lawyer_availability').insert(parsed.data.map((w) => ({ lawyer_id: uid, weekday: w.weekday, start_time: w.startTime, end_time: w.endTime })))
    if (error) return fromDb(error)
  }
  revalidatePath('/lawyer/availability')
  return ok()
}

export async function addException(input: { date: string; kind: 'unavailable' | 'available'; startTime?: string; endTime?: string; reason?: string }): Promise<ActionResult> {
  const parsed = z
    .object({ date: z.iso.date(), kind: z.enum(['unavailable', 'available']), startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), reason: z.string().max(200).optional() })
    .safeParse(input)
  if (!parsed.success) return fail('required')
  if (parsed.data.kind === 'available' && (!parsed.data.startTime || !parsed.data.endTime)) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase.from('lawyer_availability_exceptions').insert({
    lawyer_id: uid,
    exception_date: parsed.data.date,
    kind: parsed.data.kind,
    start_time: parsed.data.startTime || null,
    end_time: parsed.data.endTime || null,
    reason: parsed.data.reason || null,
  })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/availability')
  return ok()
}

export async function deleteException(id: string): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.from('lawyer_availability_exceptions').delete().eq('id', id)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/availability')
  return ok()
}

const rulesSchema = z.object({
  minNoticeHours: z.number().int().min(0).max(336),
  maxAdvanceDays: z.number().int().min(1).max(365),
  bufferMinutes: z.number().int().min(0).max(120),
  maxDailyAppointments: z.number().int().min(1).max(50).nullable(),
  cancellationDeadlineHours: z.number().int().min(0).max(168),
  autoConfirm: z.boolean(),
})

export async function saveBookingRules(input: z.input<typeof rulesSchema>): Promise<ActionResult> {
  const v = validate(rulesSchema, input)
  if ('result' in v) return v.result
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase
    .from('lawyer_profiles')
    .update({
      min_notice_hours: v.data.minNoticeHours,
      max_advance_days: v.data.maxAdvanceDays,
      buffer_minutes: v.data.bufferMinutes,
      max_daily_appointments: v.data.maxDailyAppointments,
      cancellation_deadline_hours: v.data.cancellationDeadlineHours,
      auto_confirm: v.data.autoConfirm,
    })
    .eq('id', uid)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/availability')
  return ok()
}

// ---------------------------------------------------------------- verification
export async function addCredential(input: { kind: 'bar_card' | 'degree' | 'certification' | 'license' | 'other'; title: string; issuer?: string; issuedOn?: string; documentId: string; isPublic: boolean }): Promise<ActionResult> {
  const parsed = z
    .object({ kind: z.enum(['bar_card', 'degree', 'certification', 'license', 'other']), title: z.string().trim().min(2).max(160), issuer: z.string().max(160).optional(), issuedOn: z.union([z.iso.date(), z.literal('')]).optional(), documentId: z.uuid(), isPublic: z.boolean() })
    .safeParse(input)
  if (!parsed.success) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase.from('lawyer_credentials').insert({
    lawyer_id: uid,
    kind: parsed.data.kind,
    title: parsed.data.title,
    issuer: parsed.data.issuer || null,
    issued_on: parsed.data.issuedOn || null,
    document_id: parsed.data.documentId,
    is_public: parsed.data.isPublic,
  })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/verification')
  return ok()
}

export async function submitVerification(barNumber: string, note: string, credentialIds: string[]): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.rpc('submit_lawyer_verification', { p_bar_number: barNumber, p_note: note, p_credential_ids: credentialIds })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/verification')
  return ok()
}

// ---------------------------------------------------------------- services
const serviceSchema = z.object({
  id: z.uuid().optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'invalidSlug'),
  titleAr: z.string().trim().min(5, 'tooShort').max(160),
  titleEn: z.string().trim().max(160).optional(),
  descriptionAr: z.string().trim().min(20, 'tooShort').max(5000),
  descriptionEn: z.string().trim().max(5000).optional(),
  categoryId: z.uuid().nullable(),
  price: z.number().positive().max(1_000_000),
  days: z.number().int().min(1).max(120),
  revisions: z.number().int().min(0).max(10),
  deliverables: z.array(z.string().trim().min(1).max(200)).max(20),
  requiredDocuments: z.array(z.string().trim().min(1).max(200)).max(20),
  revisionPolicy: z.string().trim().max(1000).optional(),
  refundTerms: z.string().trim().max(1000).optional(),
  submit: z.boolean(),
})

export async function saveService(input: z.input<typeof serviceSchema>): Promise<ActionResult> {
  const v = validate(serviceSchema, input)
  if ('result' in v) return v.result
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { data: lp } = await supabase.from('lawyer_profiles').select('primary_firm_id').eq('id', uid).single()
  const row: TablesInsert<'legal_services'> = {
    lawyer_id: uid,
    firm_id: lp?.primary_firm_id ?? null,
    slug: v.data.slug,
    title_ar: v.data.titleAr,
    title_en: v.data.titleEn || null,
    description_ar: v.data.descriptionAr,
    description_en: v.data.descriptionEn || null,
    category_id: v.data.categoryId,
    price_minor: toMinor(v.data.price),
    estimated_days: v.data.days,
    revisions_included: v.data.revisions,
    deliverables: v.data.deliverables,
    required_documents: v.data.requiredDocuments,
    revision_policy: v.data.revisionPolicy || null,
    refund_terms: v.data.refundTerms || null,
    ...(v.data.submit ? { status: 'pending_review' } : {}),
  }
  const { error } = v.data.id ? await supabase.from('legal_services').update(row).eq('id', v.data.id) : await supabase.from('legal_services').insert(row)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/services')
  return ok()
}

export async function archiveService(id: string): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.from('legal_services').update({ status: 'archived' }).eq('id', id)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/services')
  return ok()
}

// ---------------------------------------------------------------- clients
const clientSchema = z.object({
  id: z.uuid().optional(),
  firmId: z.uuid().nullish(),
  fullName: z.string().trim().min(2, 'tooShort').max(120),
  clientType: z.enum(['individual', 'company']),
  companyName: z.string().trim().max(160).optional(),
  email: z.union([z.email(), z.literal('')]).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(5000).optional(),
})

export async function saveClient(input: z.input<typeof clientSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(clientSchema, input)
  if ('result' in v) return v.result
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const row = {
    full_name: v.data.fullName,
    client_type: v.data.clientType,
    company_name: v.data.companyName || null,
    email: v.data.email || null,
    phone: v.data.phone || null,
    address: v.data.address || null,
    notes: v.data.notes || null,
  }
  if (v.data.id) {
    const { error } = await supabase.from('practice_clients').update(row).eq('id', v.data.id)
    if (error) return fromDb(error)
    revalidatePath('/lawyer/clients')
    return ok({ id: v.data.id })
  }
  const { data, error } = await supabase
    .from('practice_clients')
    .insert({ ...row, created_by: uid, ...(v.data.firmId ? { firm_id: v.data.firmId } : { owner_lawyer_id: uid }) })
    .select('id')
    .single()
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/lawyer/clients')
  revalidatePath('/firm/clients')
  return ok({ id: data.id })
}

// ---------------------------------------------------------------- invoices
const invoiceSchema = z.object({
  firmId: z.uuid().nullish(),
  clientRecordId: z.uuid(),
  matterId: z.uuid().nullish(),
  lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().positive().max(10000), unit: z.number().min(0).max(10_000_000) })).min(1).max(50),
  dueDate: z.union([z.iso.date(), z.literal('')]).optional(),
  notes: z.string().trim().max(2000).optional(),
  issue: z.boolean(),
})

export async function createInvoice(input: z.input<typeof invoiceSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(invoiceSchema, input)
  if ('result' in v) return v.result
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { data: client } = await supabase.from('practice_clients').select('full_name, user_id').eq('id', v.data.clientRecordId).maybeSingle()
  if (!client) return fail('notFound')
  const lines = v.data.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_minor: toMinor(l.unit) }))
  const totals = invoiceTotals(lines)
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      issuer_lawyer_id: v.data.firmId ? null : uid,
      issuer_firm_id: v.data.firmId ?? null,
      bill_to_user_id: client.user_id,
      bill_to_client_record_id: v.data.clientRecordId,
      bill_to_name: client.full_name,
      matter_id: v.data.matterId ?? null,
      status: v.data.issue ? 'issued' : 'draft',
      line_items: lines,
      subtotal_minor: totals.subtotalMinor,
      tax_minor: totals.taxMinor,
      total_minor: totals.totalMinor,
      due_date: v.data.dueDate || null,
      notes: v.data.notes || null,
      created_by: uid,
    })
    .select('id, number')
    .single()
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/lawyer/invoices')
  revalidatePath('/firm/billing')
  return ok({ id: data.id })
}

export async function setInvoiceStatus(id: string, status: 'issued' | 'void' | 'paid'): Promise<ActionResult> {
  const { supabase } = await me()
  const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidatePath('/lawyer/invoices')
  revalidatePath('/firm/billing')
  return ok()
}

// ---------------------------------------------------------------- finance
export async function addSettlementAccount(input: { firmId?: string | null; method: 'bank_transfer' | 'instapay' | 'mobile_wallet'; holder: string; bank?: string; identifier: string }): Promise<ActionResult> {
  const parsed = z
    .object({ method: z.enum(['bank_transfer', 'instapay', 'mobile_wallet']), holder: z.string().trim().min(3).max(120), identifier: z.string().trim().min(6).max(40) })
    .safeParse(input)
  if (!parsed.success) return fail('required')
  const { supabase, uid } = await me()
  if (!uid) return fail('unauthenticated')
  const { error } = await supabase.from('settlement_accounts').insert({
    lawyer_id: input.firmId ? null : uid,
    firm_id: input.firmId ?? null,
    method: parsed.data.method,
    account_holder_name: parsed.data.holder,
    bank_name: input.bank || null,
    account_identifier: parsed.data.identifier.replace(/\s/g, ''),
  })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/finance')
  return ok()
}

export async function requestPayout(amount: number, firmId?: string | null): Promise<ActionResult> {
  if (!(amount > 0)) return fail('required')
  const { supabase } = await me()
  const { error } = await supabase.rpc('request_payout', { p_amount_minor: toMinor(amount), p_firm_id: firmId ?? null })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/finance')
  revalidatePath('/firm/finance')
  return ok()
}

// ---------------------------------------------------------------- subscription
export async function startSubscription(planCode: string, cycle: 'monthly' | 'yearly', firmId?: string | null): Promise<ActionResult<{ subscriptionId: string; requiresPayment: boolean }>> {
  const { supabase } = await me()
  const { data, error } = await supabase.rpc('start_subscription', { p_plan_code: planCode, p_billing_cycle: cycle, p_firm_id: firmId ?? null })
  if (error || !data) return fromDb(error ?? {})
  const r = data as { subscription_id: string; requires_payment: boolean }
  revalidatePath('/lawyer/subscription')
  revalidatePath('/firm/subscription')
  return ok({ subscriptionId: r.subscription_id, requiresPayment: r.requires_payment })
}

export async function cancelSubscription(id: string): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.rpc('cancel_subscription', { p_subscription_id: id, p_immediately: false })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/subscription')
  revalidatePath('/firm/subscription')
  return ok()
}

export async function resumeSubscription(id: string): Promise<ActionResult> {
  const { supabase } = await me()
  const { error } = await supabase.rpc('resume_subscription', { p_subscription_id: id })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/subscription')
  return ok()
}
