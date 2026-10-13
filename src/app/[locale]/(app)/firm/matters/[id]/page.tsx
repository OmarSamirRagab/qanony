import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getFirmContext } from '@/features/firms/context'
import { MatterDetailView } from '@/features/matters/components/matter-detail'

export default async function FirmMatterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { ctx } = await getFirmContext()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { tab } = await searchParams
  return <MatterDetailView id={id} viewer="firm" userId={ctx.userId} tab={tab} />
}
