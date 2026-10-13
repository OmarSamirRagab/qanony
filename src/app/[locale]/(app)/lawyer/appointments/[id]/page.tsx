import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AppointmentDetailView } from '@/features/booking/components/appointment-detail'
import { requirePortal } from '@/lib/auth'

export default async function LawyerAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('lawyer')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <AppointmentDetailView id={id} viewer="lawyer" userId={ctx.userId} />
}
