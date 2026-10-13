import { InvoicesView } from '@/features/lawyer-portal/components/invoices-view'
import { requirePortal } from '@/lib/auth'

export default async function LawyerInvoicesPage() {
  const ctx = await requirePortal('lawyer')
  return <InvoicesView userId={ctx.userId} />
}
