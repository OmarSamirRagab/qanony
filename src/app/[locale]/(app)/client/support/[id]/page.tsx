import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { TicketView } from '@/features/support/components/ticket-view'
import { requireUser } from '@/lib/auth'

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const t = await getTranslations('dashboard.support')
  return <TicketView id={id} userId={ctx.userId} staff={false} backHref="/client/support" backLabel={t('title')} />
}
