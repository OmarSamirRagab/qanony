import { SubscriptionView } from '@/features/lawyer-portal/components/subscription-view'
import { requirePortal } from '@/lib/auth'

export default async function LawyerSubscriptionPage() {
  const ctx = await requirePortal('lawyer')
  return <SubscriptionView userId={ctx.userId} />
}
