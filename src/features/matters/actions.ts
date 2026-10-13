'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { toMinor } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/types/database'

async function session() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, userId: data.user?.id ?? null }
}

function revalidateMatter(id: string) {
  revalidatePath(`/lawyer/matters/${id}`)
  revalidatePath(`/firm/matters/${id}`)
  revalidatePath(`/client/matters/${id}`)
}

export async function createMatterFromAppointment(appointmentId: string, title: string): Promise<ActionResult<{ id: string }>> {
  if (!z.uuid().safeParse(appointmentId).success) return fail('notFound')
  const { supabase } = await session()
  const { data, error } = await supabase.rpc('create_matter_from_appointment', { p_appointment_id: appointmentId, p_title: title.slice(0, 200) })
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/lawyer/matters')
  return ok({ id: data })
}

const matterSchema = z.object({
  firmId: z.uuid().nullish(),
  ownerLawyerId: z.uuid().nullish(),
  clientRecordId: z.uuid().nullish(),
  categoryId: z.uuid().nullish(),
  title: z.string().trim().min(3, 'tooShort').max(200, 'tooLong'),
  description: z.string().trim().max(10000, 'tooLong').optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  opposingParty: z.string().trim().max(300).optional(),
  billingType: z.enum(['fixed', 'hourly', 'retainer', 'pro_bono']).default('fixed'),
  agreedFee: z.number().nonnegative().nullish(),
  aiEnabled: z.boolean().default(false),
})

export async function createMatter(input: z.input<typeof matterSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(matterSchema, input)
  if ('result' in v) return v.result
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const { data, error } = await supabase
    .from('legal_matters')
    .insert({
      firm_id: v.data.firmId ?? null,
      owner_lawyer_id: v.data.ownerLawyerId ?? userId,
      client_record_id: v.data.clientRecordId ?? null,
      category_id: v.data.categoryId ?? null,
      title: v.data.title,
      description: v.data.description || null,
      priority: v.data.priority,
      opposing_party: v.data.opposingParty || null,
      billing_type: v.data.billingType,
      agreed_fee_minor: v.data.agreedFee != null ? toMinor(v.data.agreedFee) : null,
      ai_enabled: v.data.aiEnabled,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/lawyer/matters')
  revalidatePath('/firm/matters')
  return ok({ id: data.id })
}

const updateSchema = matterSchema.partial().extend({ id: z.uuid() })

export async function updateMatter(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const v = validate(updateSchema, input)
  if ('result' in v) return v.result
  const { supabase } = await session()
  const patch: TablesUpdate<'legal_matters'> = {}
  if (v.data.title !== undefined) patch.title = v.data.title
  if (v.data.description !== undefined) patch.description = v.data.description || null
  if (v.data.priority !== undefined) patch.priority = v.data.priority
  if (v.data.categoryId !== undefined) patch.category_id = v.data.categoryId
  if (v.data.clientRecordId !== undefined) patch.client_record_id = v.data.clientRecordId
  if (v.data.opposingParty !== undefined) patch.opposing_party = v.data.opposingParty || null
  if (v.data.billingType !== undefined) patch.billing_type = v.data.billingType
  if (v.data.agreedFee !== undefined) patch.agreed_fee_minor = v.data.agreedFee != null ? toMinor(v.data.agreedFee) : null
  if (v.data.aiEnabled !== undefined) patch.ai_enabled = v.data.aiEnabled
  const { data, error } = await supabase.from('legal_matters').update(patch).eq('id', v.data.id).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidateMatter(v.data.id)
  return ok()
}

export async function changeMatterStatus(id: string, status: string): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(['NEW', 'UNDER_REVIEW', 'ACTIVE', 'WAITING_FOR_CLIENT', 'WAITING_FOR_EXTERNAL_PARTY', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'ARCHIVED']) })
    .safeParse({ id, status })
  if (!parsed.success) return fail('required')
  const { supabase } = await session()
  const { data, error } = await supabase.from('legal_matters').update({ status: parsed.data.status }).eq('id', id).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidateMatter(id)
  return ok()
}

export async function addMatterUpdate(matterId: string, summary: string, shared: boolean): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), summary: z.string().trim().min(2).max(2000) }).safeParse({ id: matterId, summary })
  if (!parsed.success) return fail('required')
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const { error } = await supabase
    .from('matter_events')
    .insert({ matter_id: matterId, actor_id: userId, event_type: 'matter.update', summary: parsed.data.summary, visibility: shared ? 'shared' : 'internal' })
  if (error) return fromDb(error)
  revalidateMatter(matterId)
  return ok()
}

const taskSchema = z.object({
  id: z.uuid().optional(),
  matterId: z.uuid(),
  title: z.string().trim().min(2, 'tooShort').max(200, 'tooLong'),
  description: z.string().trim().max(5000).optional(),
  assigneeId: z.uuid().nullish(),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
})

export async function saveTask(input: z.input<typeof taskSchema>): Promise<ActionResult> {
  const v = validate(taskSchema, input)
  if ('result' in v) return v.result
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const row = {
    matter_id: v.data.matterId,
    title: v.data.title,
    description: v.data.description || null,
    assignee_id: v.data.assigneeId ?? null,
    due_at: v.data.dueAt ?? null,
    status: v.data.status,
    priority: v.data.priority,
  }
  const { error } = v.data.id
    ? await supabase.from('matter_tasks').update(row).eq('id', v.data.id)
    : await supabase.from('matter_tasks').insert({ ...row, created_by: userId })
  if (error) return fromDb(error)
  revalidateMatter(v.data.matterId)
  revalidatePath('/firm/tasks')
  return ok()
}

export async function setTaskStatus(taskId: string, status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'): Promise<ActionResult> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('matter_tasks').update({ status }).eq('id', taskId).select('matter_id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidateMatter(data[0]!.matter_id)
  revalidatePath('/firm/tasks')
  return ok()
}

const hearingSchema = z.object({
  id: z.uuid().optional(),
  matterId: z.uuid(),
  courtName: z.string().trim().min(2, 'tooShort').max(200),
  courtLocation: z.string().trim().max(300).optional(),
  circuit: z.string().trim().max(100).optional(),
  caseNumber: z.string().trim().max(100).optional(),
  hearingAt: z.iso.datetime({ offset: true }),
  assignedLawyerId: z.uuid().nullish(),
  purpose: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  outcome: z.string().trim().max(5000).optional(),
  nextHearingAt: z.iso.datetime({ offset: true }).nullish(),
  visibleToClient: z.boolean().default(true),
})

export async function saveHearing(input: z.input<typeof hearingSchema>): Promise<ActionResult> {
  const v = validate(hearingSchema, input)
  if ('result' in v) return v.result
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const row = {
    matter_id: v.data.matterId,
    court_name: v.data.courtName,
    court_location: v.data.courtLocation || null,
    circuit: v.data.circuit || null,
    case_number: v.data.caseNumber || null,
    hearing_at: v.data.hearingAt,
    assigned_lawyer_id: v.data.assignedLawyerId ?? null,
    purpose: v.data.purpose || null,
    notes: v.data.notes || null,
    outcome: v.data.outcome || null,
    next_hearing_at: v.data.nextHearingAt ?? null,
    visible_to_client: v.data.visibleToClient,
  }
  const { error } = v.data.id
    ? await supabase.from('matter_hearings').update(row).eq('id', v.data.id)
    : await supabase.from('matter_hearings').insert({ ...row, created_by: userId })
  if (error) return fromDb(error)
  revalidateMatter(v.data.matterId)
  return ok()
}

export async function addMatterNote(matterId: string, body: string, visibility: 'private' | 'internal' | 'shared'): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(20000) }).safeParse({ id: matterId, body })
  if (!parsed.success) return fail('required')
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const { error } = await supabase.from('matter_notes').insert({ matter_id: matterId, author_id: userId, body: parsed.data.body, visibility })
  if (error) return fromDb(error)
  revalidateMatter(matterId)
  return ok()
}

export async function deleteMatterNote(noteId: string, matterId: string): Promise<ActionResult> {
  const { supabase } = await session()
  const { error } = await supabase.from('matter_notes').delete().eq('id', noteId)
  if (error) return fromDb(error)
  revalidateMatter(matterId)
  return ok()
}

export async function addExpense(input: { matterId: string; description: string; amount: number; incurredOn: string; billable: boolean }): Promise<ActionResult> {
  const parsed = z
    .object({ matterId: z.uuid(), description: z.string().trim().min(2).max(300), amount: z.number().positive(), incurredOn: z.iso.date(), billable: z.boolean() })
    .safeParse(input)
  if (!parsed.success) return fail('required')
  const { supabase, userId } = await session()
  if (!userId) return fail('unauthenticated')
  const { error } = await supabase.from('matter_expenses').insert({
    matter_id: parsed.data.matterId,
    description: parsed.data.description,
    amount_minor: toMinor(parsed.data.amount),
    incurred_on: parsed.data.incurredOn,
    billable: parsed.data.billable,
    created_by: userId,
  })
  if (error) return fromDb(error)
  revalidateMatter(parsed.data.matterId)
  return ok()
}

export async function assignMember(matterId: string, userId: string, role: 'lead' | 'associate' | 'staff', canEdit: boolean): Promise<ActionResult> {
  const { supabase, userId: me } = await session()
  if (!me) return fail('unauthenticated')
  const { error } = await supabase.from('matter_members').insert({ matter_id: matterId, user_id: userId, role, can_edit: canEdit, added_by: me })
  if (error) return fromDb(error)
  revalidateMatter(matterId)
  return ok()
}

export async function removeMember(matterId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await session()
  const { error } = await supabase.from('matter_members').delete().eq('matter_id', matterId).eq('user_id', userId)
  if (error) return fromDb(error)
  revalidateMatter(matterId)
  return ok()
}

export async function setDocumentShared(matterId: string, documentId: string, shared: boolean): Promise<ActionResult> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('matter_documents').update({ shared_with_client: shared }).eq('matter_id', matterId).eq('document_id', documentId).select('document_id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidateMatter(matterId)
  return ok()
}

export async function openMatterConversation(matterId: string): Promise<ActionResult<{ id: string }>> {
  const { supabase } = await session()
  const { data, error } = await supabase.rpc('open_matter_conversation', { p_matter_id: matterId })
  if (error || !data) return fromDb(error ?? {})
  return ok({ id: data })
}
