import { OrdersListView } from '@/features/orders/components/order-views'
import { requirePortal } from '@/lib/auth'

export default async function LawyerOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requirePortal('lawyer')
  const { page } = await searchParams
  return <OrdersListView as="lawyer" userId={ctx.userId} page={Math.max(1, Number(page) || 1)} />
}
