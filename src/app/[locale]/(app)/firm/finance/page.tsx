import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { FinanceView } from '@/features/lawyer-portal/components/finance-view'

export default async function FirmFinancePage() {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('reports.financial')) return <FirmDenied />
  return <FinanceView userId={ctx.userId} firmId={firm.firm_id} canPayout={firm.member_type === 'owner'} />
}
