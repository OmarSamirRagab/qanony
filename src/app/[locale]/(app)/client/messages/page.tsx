import { MessagesPage } from '@/features/messaging/components/messages-page'
import { requirePortal } from '@/lib/auth'

export default async function ClientMessagesPage() {
  const ctx = await requirePortal('client')
  return <MessagesPage portal="client" userId={ctx.userId} />
}
