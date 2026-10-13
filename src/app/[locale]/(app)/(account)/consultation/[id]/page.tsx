import { MapPin, MessagesSquare } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { PageHeader, StatusBadge } from '@/components/shared'
import { IntegrationPendingNotice, Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { VideoRoom } from '@/features/consultations/components/video-room'
import { Link } from '@/i18n/navigation'
import { requireUser } from '@/lib/auth'
import { canJoinMeeting } from '@/lib/domain/status'
import { formatDateTime } from '@/lib/format'
import { isVideoConfigured } from '@/lib/providers/video/daily'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const t = await getTranslations('dashboard.consultation')
  const te = await getTranslations('enums')
  const tn = await getTranslations('nav')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: a } = await supabase
    .from('appointments')
    .select('id, reference, status, starts_at, ends_at, consultation_type, client_id, lawyer_id, lawyer:lawyer_profiles(display_name_ar, display_name_en, timezone), client:profiles!appointments_client_id_fkey(full_name), office:lawyer_offices(label, address_ar, address_en, map_url)')
    .eq('id', id)
    .maybeSingle()
  if (!a || (a.client_id !== ctx.userId && a.lawyer_id !== ctx.userId)) notFound()
  const role = a.lawyer_id === ctx.userId ? 'lawyer' : 'client'
  const other = role === 'lawyer' ? a.client?.full_name : a.lawyer ? pick(locale, a.lawyer.display_name_ar, a.lawyer.display_name_en) : ''
  const { data: conv } = await supabase.from('conversations').select('id').eq('appointment_id', id).maybeSingle()
  const open = canJoinMeeting(a.status, new Date(a.starts_at), new Date(a.ends_at))
  const media = a.consultation_type === 'video' || a.consultation_type === 'voice'
  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <PageHeader
        title={`${t('title')} — ${other}`}
        description={`${te(`consultation.${a.consultation_type}`)} · ${formatDateTime(a.starts_at, locale, a.lawyer?.timezone)} · ${a.reference}`}
        actions={
          <>
            <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/${role}/appointments/${id}`}>{tn(`${role}.appointments`)}</Link>
            </Button>
          </>
        }
      />
      {media ? (
        !isVideoConfigured() ? (
          <>
            <Notice tone="warning" title={t('notConfigured')} />
            <IntegrationPendingNotice provider="Daily (DAILY_API_KEY)" className="mt-4" />
          </>
        ) : open ? (
          <div className="flex-1">
            <VideoRoom appointmentId={id} endsAt={a.ends_at} />
          </div>
        ) : (
          <Notice tone="info" title={t('notOpen')} />
        )
      ) : a.consultation_type === 'text' ? (
        <Notice tone="info" title={t('textBody')}>
          {conv ? (
            <Button asChild className="mt-3">
              <Link href={`/${role}/messages/${conv.id}`}>
                <MessagesSquare aria-hidden /> {t('openChat')}
              </Link>
            </Button>
          ) : null}
        </Notice>
      ) : (
        <Notice tone="info" title={t('inPersonBody')}>
          {a.office ? (
            <span className="mt-2 flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden /> {a.office.label} — {pick(locale, a.office.address_ar, a.office.address_en)}
            </span>
          ) : null}
        </Notice>
      )}
    </div>
  )
}
