'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

const openSchema = z
  .object({
    appointmentId: z.uuid().nullish(),
    serviceOrderId: z.uuid().nullish(),
    reason: z.enum(['no_show', 'quality', 'billing', 'misconduct', 'refund_request', 'other']),
    description: z.string().trim().min(20, 'tooShort').max(5000, 'tooLong'),
    evidenceIds: z.array(z.uuid()).max(10).default([]),
  })
  .refine((v) => Boolean(v.appointmentId) !== Boolean(v.serviceOrderId), { message: 'required' })

export async function openDispute(input: z.input<typeof openSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(openSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('open_dispute', {
    p_appointment_id: v.data.appointmentId ?? null,
    p_service_order_id: v.data.serviceOrderId ?? null,
    p_reason: v.data.reason,
    p_description: v.data.description,
  })
  if (error || !id) return fromDb(error ?? {})
  const { data: auth } = await supabase.auth.getUser()
  for (const documentId of v.data.evidenceIds) {
    await supabase.from('dispute_evidence').insert({ dispute_id: id, document_id: documentId, added_by: auth.user!.id })
  }
  revalidatePath('/client/appointments')
  return ok({ id })
}

export async function postDisputeMessage(disputeId: string, body: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(5000) }).safeParse({ id: disputeId, body })
  if (!parsed.success) return { ok: false, error: 'required' }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'unauthenticated' }
  const { error } = await supabase.from('dispute_messages').insert({ dispute_id: parsed.data.id, author_id: auth.user.id, body: parsed.data.body })
  if (error) return fromDb(error)
  revalidatePath(`/disputes/${disputeId}`)
  return ok()
}

export async function addDisputeEvidence(disputeId: string, documentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'unauthenticated' }
  const { error } = await supabase.from('dispute_evidence').insert({ dispute_id: disputeId, document_id: documentId, added_by: auth.user.id })
  if (error) return fromDb(error)
  revalidatePath(`/disputes/${disputeId}`)
  return ok()
}

export async function resolveDispute(input: { id: string; type: 'full_refund' | 'partial_refund' | 'no_refund' | 'completed' | 'cancelled'; percent?: number; resolution: string }): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('resolve_dispute', {
    p_dispute_id: input.id,
    p_resolution_type: input.type,
    p_refund_percent: input.percent ?? null,
    p_resolution: input.resolution,
  })
  if (error) return fromDb(error)
  revalidatePath('/admin/disputes')
  return ok()
}
