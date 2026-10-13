import { notFound } from 'next/navigation'
import { z } from 'zod'
import { adminAccess } from '@/features/admin/guard'
import { DisputeView } from '@/features/disputes/components/dispute-view'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'

export default async function AdminDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminAccess('disputes.manage')
  if (!ctx) return <AccessDenied />
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <DisputeView id={id} userId={ctx.userId} admin />
}
