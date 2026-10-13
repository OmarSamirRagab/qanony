import 'server-only'
import { createClient } from '@/lib/supabase/server'

export interface ConversationSummary {
  id: string
  kind: string
  subject: string | null
  lastMessageAt: string | null
  lastMessage: string | null
  unread: number
  others: { id: string; name: string; avatar: string | null }[]
  isLocked: boolean
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient()
  const [{ data: convs }, { data: unread }] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, kind, subject, last_message_at, is_locked, created_at, participants:conversation_participants(user_id, profile:profiles(id, full_name, avatar_url))')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100),
    supabase.rpc('get_unread_counts'),
  ])
  if (!convs?.length) return []
  const ids = convs.map((c) => c.id)
  // Latest message per conversation (bounded fetch, grouped client-side).
  const { data: latest } = await supabase.from('messages').select('conversation_id, body, created_at').in('conversation_id', ids).is('deleted_at', null).order('created_at', { ascending: false }).limit(300)
  const lastBy = new Map<string, string>()
  for (const m of latest ?? []) if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m.body)
  const unreadBy = new Map((unread ?? []).map((u) => [u.conversation_id, Number(u.unread)]))
  return convs.map((c) => ({
    id: c.id,
    kind: c.kind,
    subject: c.subject,
    lastMessageAt: c.last_message_at ?? c.created_at,
    lastMessage: lastBy.get(c.id) ?? null,
    unread: unreadBy.get(c.id) ?? 0,
    isLocked: c.is_locked,
    others: (c.participants ?? [])
      .filter((p) => p.user_id !== userId)
      .map((p) => ({ id: p.user_id, name: p.profile?.full_name ?? '—', avatar: p.profile?.avatar_url ?? null })),
  }))
}

export async function getConversation(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversations')
    .select('id, kind, subject, is_locked, appointment_id, matter_id, service_order_id, participants:conversation_participants(user_id, last_read_at, profile:profiles(id, full_name, avatar_url))')
    .eq('id', id)
    .maybeSingle()
  return data
}
