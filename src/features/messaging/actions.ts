'use server'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { createClient } from '@/lib/supabase/server'

/** Sends a message; RLS (app.can_post_to_conversation) decides if the thread is open. */
export async function sendMessage(conversationId: string, body: string, attachmentIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({ c: z.uuid(), body: z.string().trim().min(1).max(10000), a: z.array(z.uuid()).max(5) })
    .safeParse({ c: conversationId, body, a: attachmentIds })
  if (!parsed.success) return fail('required')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: auth.user.id, body: parsed.data.body }).select('id').single()
  if (error || !data) return fromDb(error ?? {})
  if (parsed.data.a.length) {
    const { error: attErr } = await supabase.from('message_attachments').insert(parsed.data.a.map((document_id) => ({ message_id: data.id, document_id })))
    if (attErr) return fromDb(attErr)
  }
  return ok({ id: data.id })
}

export async function markConversationRead(conversationId: string): Promise<void> {
  if (!z.uuid().safeParse(conversationId).success) return
  const supabase = await createClient()
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
}

export async function canPost(conversationId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: conv } = await supabase.from('conversations').select('is_locked, kind, appointment:appointments(status, completed_at, ends_at)').eq('id', conversationId).maybeSingle()
  if (!conv || conv.is_locked) return false
  if (conv.kind !== 'appointment') return true
  const a = conv.appointment
  if (!a) return false
  if (['CONFIRMED', 'IN_PROGRESS', 'DISPUTED'].includes(a.status)) return true
  if (a.status === 'COMPLETED') return new Date(a.completed_at ?? a.ends_at).getTime() > Date.now() - 14 * 86_400_000
  return false
}
