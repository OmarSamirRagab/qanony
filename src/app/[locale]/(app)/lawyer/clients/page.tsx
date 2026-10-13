import { ClientsListView } from '@/features/lawyer-portal/components/clients-views'
import { requirePortal } from '@/lib/auth'

export default async function LawyerClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePortal('lawyer')
  const { q } = await searchParams
  return <ClientsListView scope="lawyer" userId={ctx.userId} q={q} />
}
