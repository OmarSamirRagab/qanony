import { notFound } from 'next/navigation'
import { z } from 'zod'
import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { ClientDetailView } from '@/features/lawyer-portal/components/clients-views'

export default async function FirmClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { firm, can } = await getFirmContext()
  if (!can('clients.manage') && !can('matters.view')) return <FirmDenied />
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <ClientDetailView id={id} scope="firm" firmId={firm.firm_id} />
}
