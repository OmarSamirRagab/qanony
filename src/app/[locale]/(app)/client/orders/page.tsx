import { OrdersListView } from '@/features/orders/components/order-views'
import { requirePortal } from '@/lib/auth'

export default async function ClientOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requirePortal('client')
  const { page } = await searchParams
  return <OrdersListView as="client" userId={ctx.userId} page={Math.max(1, Number(page) || 1)} />
}
