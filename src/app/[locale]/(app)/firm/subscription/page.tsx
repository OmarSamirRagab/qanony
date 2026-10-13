import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { SubscriptionView } from '@/features/lawyer-portal/components/subscription-view'

export default async function FirmSubscriptionPage() {
  const { ctx, firm } = await getFirmContext()
  if (firm.member_type !== 'owner') return <FirmDenied />
  return <SubscriptionView userId={ctx.userId} firmId={firm.firm_id} />
}
