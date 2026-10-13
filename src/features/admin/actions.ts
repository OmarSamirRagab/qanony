'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { getUserContext } from '@/lib/auth'
import { toMinor } from '@/lib/domain/money'
import { canEditSetting, isAdmin } from '@/lib/domain/permissions'
import { cairoDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin mutations. Every call goes through the user's own Supabase session so
 * RLS policies and security-definer RPC checks (app.is_admin / has_permission)
 * remain the source of truth; the checks here only produce friendlier errors.
 */

const reason = z.string().trim().min(3, 'required').max(1000, 'tooLong')
const id = z.uuid()

async function requireAdmin() {
  const ctx = await getUserContext()
  return ctx && isAdmin(ctx.roles) ? ctx : null
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const roleEnum = z.enum(['client', 'lawyer', 'firm_owner', 'firm_staff', 'support', 'admin', 'super_admin'])

export async function setUserRole(userId: string, role: string, grant: boolean): Promise<ActionResult> {
  const v = validate(z.object({ userId: id, role: roleEnum, grant: z.boolean() }), { userId, role, grant })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_role', { p_user_id: v.data.userId, p_role: v.data.role, p_grant: v.data.grant })
  if (error) return fromDb(error)
  revalidatePath('/admin/users')
  return ok()
}

export async function setAccountStatus(userId: string, status: 'active' | 'suspended', why: string): Promise<ActionResult> {
  const v = validate(z.object({ userId: id, status: z.enum(['active', 'suspended']), why: reason }), { userId, status, why })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_account_status', { p_user_id: v.data.userId, p_status: v.data.status, p_reason: v.data.why })
  if (error) return fromDb(error)
  revalidatePath('/admin/users')
  return ok()
}

// ---------------------------------------------------------------------------
// Lawyers & firms
// ---------------------------------------------------------------------------
export async function reviewVerification(requestId: string, approve: boolean, why: string): Promise<ActionResult> {
  const v = validate(z.object({ requestId: id, approve: z.boolean(), why: reason }), { requestId, approve, why })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('review_lawyer_verification', { p_request_id: v.data.requestId, p_approve: v.data.approve, p_reason: v.data.why })
  if (error) return fromDb(error)
  revalidatePath('/admin/verification')
  return ok()
}

export async function setLawyerStatus(lawyerId: string, status: 'verified' | 'suspended', why: string): Promise<ActionResult> {
  const v = validate(z.object({ lawyerId: id, status: z.enum(['verified', 'suspended']), why: reason }), { lawyerId, status, why })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_lawyer_status', { p_lawyer_id: v.data.lawyerId, p_status: v.data.status, p_reason: v.data.why })
  if (error) return fromDb(error)
  revalidatePath('/admin/verification')
  return ok()
}

export async function setLawyerPlacement(lawyerId: string, featured: boolean, sponsoredUntil: string | null): Promise<ActionResult> {
  const v = validate(z.object({ lawyerId: id, featured: z.boolean(), sponsoredUntil: z.iso.date().nullable() }), { lawyerId, featured, sponsoredUntil })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_lawyer_placement', {
    p_lawyer_id: v.data.lawyerId,
    p_featured: v.data.featured,
    p_sponsored_until: v.data.sponsoredUntil ? `${v.data.sponsoredUntil}T23:59:59+02:00` : null,
  })
  if (error) return fromDb(error)
  revalidatePath('/admin/verification')
  return ok()
}

export async function setFirmVerification(firmId: string, status: 'verified' | 'rejected' | 'suspended', why: string): Promise<ActionResult> {
  const v = validate(z.object({ firmId: id, status: z.enum(['verified', 'rejected', 'suspended']), why: reason }), { firmId, status, why })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_firm_verification', { p_firm_id: v.data.firmId, p_status: v.data.status, p_reason: v.data.why })
  if (error) return fromDb(error)
  revalidatePath('/admin/firms')
  return ok()
}

export async function moderateService(serviceId: string, status: 'active' | 'suspended' | 'draft', note: string): Promise<ActionResult> {
  const v = validate(z.object({ serviceId: id, status: z.enum(['active', 'suspended', 'draft']), note: z.string().trim().max(1000, 'tooLong') }), { serviceId, status, note })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_moderate_service', { p_service_id: v.data.serviceId, p_status: v.data.status, p_note: v.data.note })
  if (error) return fromDb(error)
  revalidatePath('/admin/services')
  return ok()
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
export async function createRefund(paymentId: string, amountEgp: number, why: string): Promise<ActionResult> {
  const v = validate(z.object({ paymentId: id, amountEgp: z.number().positive('required'), why: reason }), { paymentId, amountEgp, why })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_create_refund', { p_payment_id: v.data.paymentId, p_amount_minor: toMinor(v.data.amountEgp), p_reason: v.data.why })
  if (error) return fromDb(error)
  revalidatePath('/admin/payments')
  revalidatePath('/admin/refunds')
  return ok()
}

/** Argument order matches ReasonAction (value, amount) so it can be bound with the payment id. */
export async function refundPayment(paymentId: string, why: string, amountEgp?: number): Promise<ActionResult> {
  return createRefund(paymentId, amountEgp ?? 0, why)
}

const settlementSchema = z
  .object({
    lawyerId: id.nullish(),
    firmId: id.nullish(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    payoutRequestId: id.nullish(),
  })
  .refine((s) => Boolean(s.lawyerId) !== Boolean(s.firmId), { message: 'required', path: ['lawyerId'] })
  .refine((s) => s.periodStart <= s.periodEnd, { message: 'invalidRange', path: ['periodEnd'] })

export async function createSettlement(input: z.input<typeof settlementSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(settlementSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_settlement', {
    p_lawyer_id: v.data.lawyerId ?? null,
    p_firm_id: v.data.firmId ?? null,
    p_period_start: v.data.periodStart,
    p_period_end: v.data.periodEnd,
    p_payout_request_id: v.data.payoutRequestId ?? null,
  })
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/admin/settlements')
  return ok({ id: data })
}

/** Approves a payout request by preparing a settlement capped at the requested amount. */
export async function settlePayout(requestId: string): Promise<ActionResult<{ id: string }>> {
  const v = validate(id, requestId)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: req, error } = await supabase.from('payout_requests').select('lawyer_id, firm_id, created_at').eq('id', v.data).eq('status', 'requested').maybeSingle()
  if (error) return fromDb(error)
  if (!req) return fail('notFound')
  return createSettlement({ lawyerId: req.lawyer_id, firmId: req.firm_id, periodStart: '2020-01-01', periodEnd: cairoDate(), payoutRequestId: v.data })
}

export async function markSettlementPaid(settlementId: string, reference: string): Promise<ActionResult> {
  const v = validate(z.object({ settlementId: id, reference: z.string().trim().min(3, 'required').max(120, 'tooLong') }), { settlementId, reference })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_mark_settlement_paid', { p_settlement_id: v.data.settlementId, p_reference: v.data.reference })
  if (error) return fromDb(error)
  revalidatePath('/admin/settlements')
  return ok()
}

export async function rejectPayout(requestId: string, note: string): Promise<ActionResult> {
  const v = validate(z.object({ requestId: id, note: reason }), { requestId, note })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_reject_payout', { p_request_id: v.data.requestId, p_note: v.data.note })
  if (error) return fromDb(error)
  revalidatePath('/admin/settlements')
  return ok()
}

const commissionSchema = z
  .object({
    scope: z.enum(['global', 'firm', 'lawyer', 'service', 'promotion']),
    targetId: z.string().trim().optional(),
    appliesTo: z.enum(['appointment', 'service_order', 'invoice']).nullish(),
    ratePercent: z.number().min(0).max(50),
    fixedEgp: z.number().min(0).max(100000).default(0),
    startsAt: z.iso.date().nullish(),
    endsAt: z.iso.date().nullish(),
    description: z.string().trim().max(300, 'tooLong').optional(),
  })
  .refine((c) => c.scope === 'global' || c.scope === 'promotion' || z.uuid().safeParse(c.targetId).success, { message: 'required', path: ['targetId'] })

export async function createCommissionRule(input: z.input<typeof commissionSchema>): Promise<ActionResult> {
  const v = validate(commissionSchema, input)
  if ('result' in v) return v.result
  const ctx = await requireAdmin()
  if (!ctx) return fail('forbidden')
  const c = v.data
  const supabase = await createClient()
  const { error } = await supabase.from('commission_rules').insert({
    scope: c.scope,
    lawyer_id: c.scope === 'lawyer' ? c.targetId! : null,
    firm_id: c.scope === 'firm' ? c.targetId! : null,
    service_id: c.scope === 'service' ? c.targetId! : null,
    applies_to: c.appliesTo ?? null,
    rate_bps: Math.round(c.ratePercent * 100),
    fixed_minor: toMinor(c.fixedEgp),
    starts_at: c.startsAt ? `${c.startsAt}T00:00:00+02:00` : null,
    ends_at: c.endsAt ? `${c.endsAt}T23:59:59+02:00` : null,
    description: c.description || null,
    created_by: ctx.userId,
  })
  if (error) return fromDb(error)
  revalidatePath('/admin/commissions')
  return ok()
}

export async function setCommissionRuleActive(ruleId: string, active: boolean): Promise<ActionResult> {
  const v = validate(z.object({ ruleId: id, active: z.boolean() }), { ruleId, active })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.from('commission_rules').update({ is_active: v.data.active }).eq('id', v.data.ruleId)
  if (error) return fromDb(error)
  revalidatePath('/admin/commissions')
  return ok()
}

const planSchema = z.object({
  id,
  nameAr: z.string().trim().min(2, 'required').max(80),
  nameEn: z.string().trim().min(2, 'required').max(80),
  monthlyEgp: z.number().min(0).max(1_000_000),
  yearlyEgp: z.number().min(0).max(10_000_000),
  trialDays: z.number().int().min(0).max(90),
  isActive: z.boolean(),
  features: z.array(z.object({ key: z.string().regex(/^[a-z_]+(\.[a-z_]+)*$/), enabled: z.boolean(), limit: z.number().int().min(0).nullable() })).max(50),
})

export async function savePlan(input: z.input<typeof planSchema>): Promise<ActionResult> {
  const v = validate(planSchema, input)
  if ('result' in v) return v.result
  const p = v.data
  const supabase = await createClient()
  const { error } = await supabase
    .from('subscription_plans')
    .update({ name_ar: p.nameAr, name_en: p.nameEn, price_monthly_minor: toMinor(p.monthlyEgp), price_yearly_minor: toMinor(p.yearlyEgp), trial_days: p.trialDays, is_active: p.isActive })
    .eq('id', p.id)
  if (error) return fromDb(error)
  if (p.features.length) {
    const { error: fe } = await supabase
      .from('plan_features')
      .upsert(p.features.map((f) => ({ plan_id: p.id, feature_key: f.key, enabled: f.enabled, limit_value: f.limit })), { onConflict: 'plan_id,feature_key' })
    if (fe) return fromDb(fe)
  }
  revalidatePath('/admin/subscriptions')
  revalidatePath('/pricing')
  return ok()
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
const slug = z.string().trim().regex(/^[a-z0-9-]{2,80}$/, 'invalidSlug')

const articleSchema = z.object({
  id: id.nullish(),
  slug,
  kind: z.enum(['article', 'guide']),
  categoryId: id.nullish(),
  titleAr: z.string().trim().min(3, 'required').max(200),
  titleEn: z.string().trim().max(200).optional(),
  excerptAr: z.string().trim().max(500).optional(),
  excerptEn: z.string().trim().max(500).optional(),
  bodyAr: z.string().trim().min(20, 'required').max(50_000, 'tooLong'),
  bodyEn: z.string().trim().max(50_000, 'tooLong').optional(),
  sources: z.array(z.string().trim().min(1).max(500)).max(30),
  reviewedByLawyer: z.boolean(),
  status: z.enum(['draft', 'published', 'archived']),
})

export async function saveArticle(input: z.input<typeof articleSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(articleSchema, input)
  if ('result' in v) return v.result
  const ctx = await requireAdmin()
  if (!ctx) return fail('forbidden')
  const a = v.data
  const words = a.bodyAr.split(/\s+/).length
  const row = {
    slug: a.slug,
    kind: a.kind,
    category_id: a.categoryId ?? null,
    title_ar: a.titleAr,
    title_en: a.titleEn || null,
    excerpt_ar: a.excerptAr || null,
    excerpt_en: a.excerptEn || null,
    body_ar: a.bodyAr,
    body_en: a.bodyEn || null,
    sources: a.sources,
    reviewed_by_lawyer: a.reviewedByLawyer,
    status: a.status,
    reading_minutes: Math.max(1, Math.round(words / 180)),
    ...(a.status === 'published' ? { published_at: new Date().toISOString() } : {}),
  }
  const supabase = await createClient()
  const res = a.id
    ? await supabase.from('legal_articles').update(row).eq('id', a.id).select('id').single()
    : await supabase.from('legal_articles').insert({ ...row, author_id: ctx.userId }).select('id').single()
  if (res.error || !res.data) return fromDb(res.error ?? {})
  revalidatePath('/admin/content')
  revalidatePath('/articles')
  return ok({ id: res.data.id })
}

const faqSchema = z.object({
  id: id.nullish(),
  audience: z.enum(['general', 'client', 'lawyer', 'firm']),
  questionAr: z.string().trim().min(5, 'required').max(300),
  questionEn: z.string().trim().max(300).optional(),
  answerAr: z.string().trim().min(5, 'required').max(5000),
  answerEn: z.string().trim().max(5000).optional(),
  sortOrder: z.number().int().min(0).max(1000),
  isPublished: z.boolean(),
})

export async function saveFaq(input: z.input<typeof faqSchema>): Promise<ActionResult> {
  const v = validate(faqSchema, input)
  if ('result' in v) return v.result
  const f = v.data
  const row = {
    audience: f.audience,
    question_ar: f.questionAr,
    question_en: f.questionEn || null,
    answer_ar: f.answerAr,
    answer_en: f.answerEn || null,
    sort_order: f.sortOrder,
    is_published: f.isPublished,
  }
  const supabase = await createClient()
  const { error } = f.id ? await supabase.from('faqs').update(row).eq('id', f.id) : await supabase.from('faqs').insert(row)
  if (error) return fromDb(error)
  revalidatePath('/admin/content')
  revalidatePath('/faq')
  return ok()
}

export async function deleteFaq(faqId: string): Promise<ActionResult> {
  const v = validate(id, faqId)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.from('faqs').delete().eq('id', v.data)
  if (error) return fromDb(error)
  revalidatePath('/admin/content')
  revalidatePath('/faq')
  return ok()
}

const pageSchema = z.object({
  slug: z.enum(['privacy', 'terms', 'refund-policy', 'about']),
  titleAr: z.string().trim().min(2, 'required').max(200),
  titleEn: z.string().trim().max(200).optional(),
  bodyAr: z.string().trim().min(20, 'required').max(100_000, 'tooLong'),
  bodyEn: z.string().trim().max(100_000, 'tooLong').optional(),
  status: z.enum(['draft', 'published', 'archived']),
})

export async function saveCmsPage(input: z.input<typeof pageSchema>): Promise<ActionResult> {
  const v = validate(pageSchema, input)
  if ('result' in v) return v.result
  const ctx = await requireAdmin()
  if (!ctx) return fail('forbidden')
  const p = v.data
  const supabase = await createClient()
  const { error } = await supabase.from('cms_pages').upsert(
    { slug: p.slug, title_ar: p.titleAr, title_en: p.titleEn || null, body_ar: p.bodyAr, body_en: p.bodyEn || null, status: p.status, updated_by: ctx.userId },
    { onConflict: 'slug' },
  )
  if (error) return fromDb(error)
  revalidatePath('/admin/content')
  revalidatePath(`/${p.slug}`)
  return ok()
}

const categorySchema = z.object({
  id: id.nullish(),
  slug,
  nameAr: z.string().trim().min(2, 'required').max(80),
  nameEn: z.string().trim().min(2, 'required').max(80),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
})

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<ActionResult> {
  const v = validate(categorySchema, input)
  if ('result' in v) return v.result
  const c = v.data
  const row = { slug: c.slug, name_ar: c.nameAr, name_en: c.nameEn, icon: c.icon || null, sort_order: c.sortOrder, is_active: c.isActive }
  const supabase = await createClient()
  const { error } = c.id ? await supabase.from('legal_categories').update(row).eq('id', c.id) : await supabase.from('legal_categories').insert(row)
  if (error) return fromDb(error)
  revalidatePath('/admin/categories')
  revalidatePath('/categories')
  return ok()
}

export async function setContactStatus(messageId: string, status: 'new' | 'handled' | 'spam'): Promise<ActionResult> {
  const v = validate(z.object({ messageId: id, status: z.enum(['new', 'handled', 'spam']) }), { messageId, status })
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.from('contact_messages').update({ status: v.data.status }).eq('id', v.data.messageId)
  if (error) return fromDb(error)
  revalidatePath('/admin/support')
  return ok()
}

// ---------------------------------------------------------------------------
// Platform settings
// ---------------------------------------------------------------------------
export async function saveSetting(key: string, valueJson: string, isPublic: boolean): Promise<ActionResult> {
  const v = validate(z.object({ key: z.string().regex(/^[a-z_]+$/), valueJson: z.string().max(20_000, 'tooLong'), isPublic: z.boolean() }), { key, valueJson, isPublic })
  if ('result' in v) return v.result
  const ctx = await getUserContext()
  if (!ctx || !canEditSetting(ctx.roles, v.data.key)) return fail('forbidden')
  let value: unknown
  try {
    value = JSON.parse(v.data.valueJson)
  } catch {
    return { ok: false, error: 'required', fieldErrors: { valueJson: 'invalidJson' } }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key: v.data.key, value: value as never, is_public: v.data.isPublic, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return fromDb(error)
  revalidatePath('/admin/settings')
  return ok()
}
