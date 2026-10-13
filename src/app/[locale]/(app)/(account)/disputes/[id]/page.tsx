import { notFound } from 'next/navigation'
import { z } from 'zod'
import { DisputeView } from '@/features/disputes/components/dispute-view'
import { requireUser } from '@/lib/auth'

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  return <DisputeView id={id} userId={ctx.userId} admin={false} />
}
