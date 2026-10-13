import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { TicketView } from '@/features/support/components/ticket-view'

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminAccess('support.tickets')
  if (!ctx) return <AccessDenied />
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const t = await getTranslations('admin.support')
  return <TicketView id={id} userId={ctx.userId} staff backHref="/admin/support" backLabel={t('title')} />
}
