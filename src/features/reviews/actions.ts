'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

const submitSchema = z
  .object({
    appointmentId: z.uuid().nullish(),
    serviceOrderId: z.uuid().nullish(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000, 'tooLong').optional(),
  })
  .refine((v) => Boolean(v.appointmentId) !== Boolean(v.serviceOrderId), { message: 'required' })

export async function submitReview(input: z.input<typeof submitSchema>): Promise<ActionResult<{ status: string }>> {
  const v = validate(submitSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('submit_review', {
    p_appointment_id: v.data.appointmentId ?? null,
    p_service_order_id: v.data.serviceOrderId ?? null,
    p_rating: v.data.rating,
    p_comment: v.data.comment ?? '',
  })
  if (error || !id) return fromDb(error ?? {})
  const { data } = await supabase.from('reviews').select('status').eq('id', id).single()
  revalidatePath('/client/reviews')
  return ok({ status: data?.status ?? 'pending' })
}

export async function respondToReview(reviewId: string, response: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), response: z.string().trim().min(2).max(2000) }).safeParse({ id: reviewId, response })
  if (!parsed.success) return { ok: false, error: 'required' }
  const supabase = await createClient()
  const { error } = await supabase.from('reviews').update({ lawyer_response: parsed.data.response }).eq('id', parsed.data.id)
  if (error) return fromDb(error)
  revalidatePath('/lawyer/reviews')
  return ok()
}

export async function reportReview(reviewId: string, reason: string, details: string): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.uuid(), reason: z.enum(['confidential_info', 'offensive', 'fake', 'spam', 'other']), details: z.string().max(1000) })
    .safeParse({ id: reviewId, reason, details })
  if (!parsed.success) return { ok: false, error: 'required' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('report_review', { p_review_id: parsed.data.id, p_reason: parsed.data.reason, p_details: parsed.data.details })
  if (error) return fromDb(error)
  return ok()
}

export async function moderateReview(reviewId: string, status: 'published' | 'hidden' | 'rejected', note: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('moderate_review', { p_review_id: reviewId, p_status: status, p_note: note })
  if (error) return fromDb(error)
  revalidatePath('/admin/reviews')
  return ok()
}
