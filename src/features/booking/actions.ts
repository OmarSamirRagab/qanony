'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

const bookSchema = z.object({
  lawyerId: z.uuid(),
  type: z.enum(['video', 'voice', 'text', 'in_person', 'written_opinion']),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  issue: z.string().trim().min(20, 'tooShort').max(4000, 'tooLong'),
  categoryId: z.uuid().nullable().optional(),
  officeId: z.uuid().nullable().optional(),
})

export async function bookAppointment(input: z.input<typeof bookSchema>): Promise<ActionResult<{ id: string; status: Enums<'appointment_status'> }>> {
  const v = validate(bookSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data: id, error } = await supabase.rpc('book_appointment', {
    p_lawyer_id: v.data.lawyerId,
    p_consultation_type: v.data.type,
    p_starts_at: v.data.startsAt,
    p_issue_summary: v.data.issue,
    p_category_id: v.data.categoryId ?? undefined,
    p_office_id: v.data.officeId ?? undefined,
  })
  if (error || !id) return fromDb(error ?? {})
  const { data: appt } = await supabase.from('appointments').select('status').eq('id', id).single()
  revalidatePath('/client/appointments')
  return ok({ id, status: appt?.status ?? 'PENDING_PAYMENT' })
}

const transitionSchema = z.object({
  id: z.uuid(),
  to: z.enum(['CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']),
  reason: z.string().trim().max(1000).optional(),
})

export async function transitionAppointment(input: z.input<typeof transitionSchema>): Promise<ActionResult> {
  const v = validate(transitionSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_appointment', {
    p_appointment_id: v.data.id,
    p_to: v.data.to,
    p_reason: v.data.reason || undefined,
  })
  if (error) return fromDb(error)
  revalidatePath('/client/appointments')
  revalidatePath('/lawyer/appointments')
  return ok()
}

const rescheduleSchema = z.object({ id: z.uuid(), startsAt: z.iso.datetime({ offset: true }), reason: z.string().trim().max(500).optional() })

export async function rescheduleAppointment(input: z.input<typeof rescheduleSchema>): Promise<ActionResult> {
  const v = validate(rescheduleSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { error } = await supabase.rpc('reschedule_appointment', {
    p_appointment_id: v.data.id,
    p_new_starts_at: v.data.startsAt,
    p_reason: v.data.reason || undefined,
  })
  if (error) return fromDb(error)
  revalidatePath('/client/appointments')
  revalidatePath('/lawyer/appointments')
  return ok()
}

const followUpSchema = z.object({
  originalId: z.uuid(),
  type: z.enum(['video', 'voice', 'text', 'in_person']),
  startsAt: z.iso.datetime({ offset: true }),
  priceMinor: z.number().int().min(0),
  note: z.string().trim().max(1000).optional(),
})

export async function createFollowUp(input: z.input<typeof followUpSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(followUpSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_follow_up_appointment', {
    p_original_id: v.data.originalId,
    p_consultation_type: v.data.type,
    p_starts_at: v.data.startsAt,
    p_price_minor: v.data.priceMinor,
    p_note: v.data.note ?? '',
  })
  if (error || !data) return fromDb(error ?? {})
  revalidatePath('/lawyer/appointments')
  return ok({ id: data })
}

/** Slots for the booking calendar (public RPC; works for anonymous visitors too). */
export async function fetchSlots(lawyerId: string, type: Enums<'consultation_kind'>, from: string, to: string): Promise<{ starts_at: string; ends_at: string }[]> {
  if (!z.uuid().safeParse(lawyerId).success || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return []
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_available_slots', { p_lawyer_id: lawyerId, p_consultation_type: type, p_from: from, p_to: to })
  return data ?? []
}
