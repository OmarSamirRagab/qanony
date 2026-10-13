import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Notice } from '@/components/shared/notices'
import { AppointmentDetailView } from '@/features/booking/components/appointment-detail'
import { requirePortal } from '@/lib/auth'

export default async function ClientAppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string }> }) {
  const ctx = await requirePortal('client')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { booked } = await searchParams
  const t = await getTranslations('dashboard.appointments')
  return (
    <>
      {booked ? <Notice tone="gold" className="mb-5" title={t('booked')} /> : null}
      <AppointmentDetailView id={id} viewer="client" userId={ctx.userId} />
    </>
  )
}
