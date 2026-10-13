'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'
import { emailSchema } from '@/lib/validation'
import type { TablesUpdate } from '@/types/database'

async function sb() {
  return createClient()
}

const createSchema = z.object({
  nameAr: z.string().trim().min(3, 'tooShort').max(160),
  nameEn: z.string().trim().max(160).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]*$/, 'invalidSlug').max(60).optional(),
  governorateId: z.number().int().positive().nullable(),
})

export async function createFirm(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(createSchema, input)
  if ('result' in v) return v.result
  const supabase = await sb()
  const { data, error } = await supabase.rpc('create_law_firm', {
    p_name_ar: v.data.nameAr,
    p_name_en: v.data.nameEn ?? '',
    p_slug: v.data.slug ?? '',
    p_governorate_id: v.data.governorateId,
    p_city_id: null,
  })
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/', 'layout')
  return ok({ id: data })
}

export async function respondInvitation(memberId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await sb()
  const { error } = await supabase.rpc('respond_firm_invitation', { p_member_id: memberId, p_accept: accept })
  if (error) return fromDb(error)
  revalidatePath('/', 'layout')
  return ok()
}

export async function inviteMember(firmId: string, email: string, memberType: 'lawyer' | 'staff', roleId: string | null): Promise<ActionResult> {
  const e = emailSchema.safeParse(email)
  if (!e.success) return { ok: false, error: 'required', fieldErrors: { email: 'invalidEmail' } }
  const supabase = await sb()
  const { error } = await supabase.rpc('invite_firm_member', { p_firm_id: firmId, p_email: e.data, p_member_type: memberType, p_role_id: roleId })
  if (error) return fromDb(error)
  revalidatePath('/firm/team')
  return ok()
}

export async function updateMember(input: { memberId: string; roleId: string | null; status: 'active' | 'suspended' | 'removed' | 'invited'; branchId: string | null; departmentId: string | null; title: string | null }): Promise<ActionResult> {
  const supabase = await sb()
  const { error } = await supabase.rpc('update_firm_member', {
    p_member_id: input.memberId,
    p_role_id: input.roleId,
    p_status: input.status,
    p_branch_id: input.branchId,
    p_department_id: input.departmentId,
    p_title: input.title,
  })
  if (error) return fromDb(error)
  revalidatePath('/firm/team')
  return ok()
}

export async function setMemberOverride(memberId: string, permission: string, value: 'inherit' | 'grant' | 'revoke'): Promise<ActionResult> {
  const supabase = await sb()
  const { error } =
    value === 'inherit'
      ? await supabase.from('law_firm_member_permissions').delete().eq('member_id', memberId).eq('permission', permission)
      : await supabase.from('law_firm_member_permissions').upsert({ member_id: memberId, permission, granted: value === 'grant' }, { onConflict: 'member_id,permission' })
  if (error) return fromDb(error)
  revalidatePath('/firm/team')
  return ok()
}

export async function saveRole(firmId: string, roleId: string | null, name: string, permissions: string[]): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(2).max(60), permissions: z.array(z.string()).max(20) }).safeParse({ name, permissions })
  if (!parsed.success) return fail('required')
  const supabase = await sb()
  const { data: ent } = await supabase.rpc('my_entitlements', { p_firm_id: firmId })
  const features = (ent as { features?: Record<string, { enabled: boolean }> } | null)?.features ?? {}
  if (!features['firm.custom_permissions']?.enabled) return fail('planLimit')
  const { error } = roleId
    ? await supabase.from('law_firm_roles').update({ name: parsed.data.name, permissions: parsed.data.permissions }).eq('id', roleId).eq('firm_id', firmId)
    : await supabase.from('law_firm_roles').insert({ firm_id: firmId, name: parsed.data.name, permissions: parsed.data.permissions })
  if (error) return fromDb(error)
  revalidatePath('/firm/roles')
  return ok()
}

export async function saveBranch(firmId: string, input: { id?: string; nameAr: string; addressAr: string; phone?: string; isHeadquarters: boolean }): Promise<ActionResult> {
  const parsed = z.object({ nameAr: z.string().trim().min(2), addressAr: z.string().trim().min(3) }).safeParse(input)
  if (!parsed.success) return fail('required')
  const supabase = await sb()
  const row = { firm_id: firmId, name_ar: input.nameAr, address_ar: input.addressAr, phone: input.phone || null, is_headquarters: input.isHeadquarters }
  const { error } = input.id ? await supabase.from('law_firm_branches').update(row).eq('id', input.id) : await supabase.from('law_firm_branches').insert(row)
  if (error) return fromDb(error)
  revalidatePath('/firm/branches')
  return ok()
}

export async function addDepartment(firmId: string, name: string): Promise<ActionResult> {
  if (name.trim().length < 2) return fail('required')
  const supabase = await sb()
  const { error } = await supabase.from('law_firm_departments').insert({ firm_id: firmId, name_ar: name.trim() })
  if (error) return fromDb(error)
  revalidatePath('/firm/branches')
  return ok()
}

const profileSchema = z.object({
  nameAr: z.string().trim().min(3).max(160),
  nameEn: z.string().trim().max(160).optional(),
  descriptionAr: z.string().trim().max(5000).optional(),
  descriptionEn: z.string().trim().max(5000).optional(),
  website: z.union([z.url(), z.literal('')]).optional(),
  email: z.union([emailSchema, z.literal('')]).optional(),
  phone: z.string().trim().max(20).optional(),
  commercialRegistration: z.string().trim().max(60).optional(),
  foundedYear: z.number().int().min(1800).max(2100).nullable(),
  governorateId: z.number().int().positive().nullable(),
  aiEnabled: z.boolean(),
  isPublished: z.boolean(),
})

export async function updateFirmProfile(firmId: string, input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const v = validate(profileSchema, input)
  if ('result' in v) return v.result
  const supabase = await sb()
  const patch: TablesUpdate<'law_firms'> = {
    name_ar: v.data.nameAr,
    name_en: v.data.nameEn || null,
    description_ar: v.data.descriptionAr || null,
    description_en: v.data.descriptionEn || null,
    website: v.data.website || null,
    email: v.data.email || null,
    phone: v.data.phone || null,
    commercial_registration: v.data.commercialRegistration || null,
    founded_year: v.data.foundedYear,
    governorate_id: v.data.governorateId,
    ai_enabled: v.data.aiEnabled,
    is_published: v.data.isPublished,
  }
  const { data, error } = await supabase.from('law_firms').update(patch).eq('id', firmId).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidatePath('/firm/profile')
  return ok()
}

export async function setPrimaryFirm(firmId: string | null): Promise<ActionResult> {
  const supabase = await sb()
  const { error } = await supabase.rpc('set_primary_firm', { p_firm_id: firmId })
  if (error) return fromDb(error)
  revalidatePath('/lawyer/profile')
  return ok()
}
