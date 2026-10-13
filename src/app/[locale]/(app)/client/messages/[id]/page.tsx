import { notFound } from 'next/navigation'
import { z } from 'zod'
import { MessagesPage } from '@/features/messaging/components/messages-page'
import { requirePortal } from '@/lib/auth'

export default async function ClientConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('client')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <MessagesPage portal="client" userId={ctx.userId} conversationId={id} />
}
