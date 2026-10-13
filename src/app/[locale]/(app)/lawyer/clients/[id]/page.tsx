import { notFound } from 'next/navigation'
import { z } from 'zod'
import { ClientDetailView } from '@/features/lawyer-portal/components/clients-views'
import { requirePortal } from '@/lib/auth'

export default async function LawyerClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal('lawyer')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <ClientDetailView id={id} scope="lawyer" />
}
