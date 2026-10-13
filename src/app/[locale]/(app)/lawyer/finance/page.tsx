import { FinanceView } from '@/features/lawyer-portal/components/finance-view'
import { requirePortal } from '@/lib/auth'

export default async function LawyerFinancePage() {
  const ctx = await requirePortal('lawyer')
  return <FinanceView userId={ctx.userId} />
}
