import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AppointmentDetailView } from '@/features/booking/components/appointment-detail'
import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'

export default async function FirmAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, can } = await getFirmContext()
  if (!can('appointments.manage')) return <FirmDenied />
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <AppointmentDetailView id={id} viewer="lawyer" userId={ctx.userId} />
}
