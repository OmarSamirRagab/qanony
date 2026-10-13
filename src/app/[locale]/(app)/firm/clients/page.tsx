import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { ClientsListView } from '@/features/lawyer-portal/components/clients-views'

export default async function FirmClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('clients.manage')) return <FirmDenied />
  const { q } = await searchParams
  return <ClientsListView scope="firm" userId={ctx.userId} firmId={firm.firm_id} q={q} />
}
