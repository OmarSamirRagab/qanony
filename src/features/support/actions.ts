'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, fromDb, ok, validate, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'tooShort').max(200, 'tooLong'),
  category: z.enum(['account', 'booking', 'payment', 'technical', 'verification', 'other']),
  message: z.string().trim().min(10, 'tooShort').max(5000, 'tooLong'),
})

export async function createTicket(input: z.input<typeof ticketSchema>): Promise<ActionResult<{ id: string }>> {
  const v = validate(ticketSchema, input)
  if ('result' in v) return v.result
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data, error } = await supabase.from('support_tickets').insert({ requester_id: auth.user.id, subject: v.data.subject, category: v.data.category }).select('id').single()
  if (error || !data) return fromDb(error ?? {})
  const { error: mErr } = await supabase.from('support_ticket_messages').insert({ ticket_id: data.id, author_id: auth.user.id, body: v.data.message })
  if (mErr) return fromDb(mErr)
  revalidatePath('/client/support')
  return ok({ id: data.id })
}

export async function replyTicket(ticketId: string, body: string, internal = false): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(5000) }).safeParse({ id: ticketId, body })
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { error } = await supabase.from('support_ticket_messages').insert({ ticket_id: ticketId, author_id: auth.user.id, body: parsed.data.body, is_internal: internal })
  if (error) return fromDb(error)
  revalidatePath(`/client/support/${ticketId}`)
  revalidatePath(`/admin/support/${ticketId}`)
  return ok()
}

export async function setTicketStatus(ticketId: string, status: 'open' | 'pending' | 'resolved' | 'closed', assignToMe = false): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const patch: { status: typeof status; assigned_to?: string } = { status }
  if (assignToMe && auth.user) patch.assigned_to = auth.user.id
  const { data, error } = await supabase.from('support_tickets').update(patch).eq('id', ticketId).select('id')
  if (error) return fromDb(error)
  if (!data?.length) return fail('forbidden')
  revalidatePath(`/admin/support/${ticketId}`)
  return ok()
}
