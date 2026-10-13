import { notFound } from 'next/navigation'
import { z } from 'zod'
import { MatterDetailView } from '@/features/matters/components/matter-detail'
import { requirePortal } from '@/lib/auth'

export default async function LawyerMatterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePortal('lawyer')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { tab } = await searchParams
  return <MatterDetailView id={id} viewer="lawyer" userId={ctx.userId} tab={tab} />
}
