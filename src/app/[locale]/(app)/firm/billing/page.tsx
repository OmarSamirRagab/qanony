import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { InvoicesView } from '@/features/lawyer-portal/components/invoices-view'

export default async function FirmBillingPage() {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('invoices.view')) return <FirmDenied />
  return <InvoicesView userId={ctx.userId} firmId={firm.firm_id} canManage={can('invoices.manage')} />
}
