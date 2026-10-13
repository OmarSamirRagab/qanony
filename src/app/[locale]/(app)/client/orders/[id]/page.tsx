import { notFound } from 'next/navigation'
import { z } from 'zod'
import { OrderDetailView } from '@/features/orders/components/order-views'
import { requirePortal } from '@/lib/auth'

export default async function ClientOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('client')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <OrderDetailView id={id} viewer="client" userId={ctx.userId} />
}
