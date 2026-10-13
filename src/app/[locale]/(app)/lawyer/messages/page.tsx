import { MessagesPage } from '@/features/messaging/components/messages-page'
import { requirePortal } from '@/lib/auth'

export default async function LawyerMessagesPage() {
  const ctx = await requirePortal('lawyer')
  return <MessagesPage portal="lawyer" userId={ctx.userId} />
}
