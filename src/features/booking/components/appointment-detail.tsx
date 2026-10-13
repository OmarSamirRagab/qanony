import { CalendarPlus, Clock, CreditCard, FileText, History, Lock, MapPin, ScrollText } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Breadcrumbs } from '@/components/shared/server'
import { NoteComposer } from '@/components/shared/note-composer'
import { Badge } from '@/components/ui/card'
import { Avatar } from '@/components/ui/primitives'
import { DocumentList } from '@/features/documents/components/document-list'
import { DocumentUploader } from '@/features/documents/components/document-uploader'
import { getPublicSettings } from '@/features/reference/queries'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { cairoDate, formatDateTime } from '@/lib/format'
import { pick } from '@/lib/utils'
import { addAppointmentNote } from '../notes-actions'
import { getAppointment } from '../queries'
import { AppointmentActions } from './appointment-actions'

export async function AppointmentDetailView({ id, viewer, userId }: { id: string; viewer: 'client' | 'lawyer'; userId: string }) {
  const data = await getAppointment(id)
  if (!data) notFound()
  const { appt, notes, events, documents, conversationId, review, payment, dispute, offerings } = data
  const t = await getTranslations('dashboard.appointments')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const tn = await getTranslations('nav')
  const locale = await getLocale()
  const settings = await getPublicSettings()
  const latePercent = Number((settings.refund_policy as { late_cancel_refund_percent?: number } | undefined)?.late_cancel_refund_percent ?? 50)
  const tz = appt.lawyer?.timezone ?? 'Africa/Cairo'
  const lawyerName = appt.lawyer ? pick(locale, appt.lawyer.display_name_ar, appt.lawyer.display_name_en) : ''
  const counterpart = viewer === 'client' ? lawyerName : (appt.client?.full_name ?? '')
  const paidMinor = payment && ['succeeded', 'partially_refunded'].includes(payment.status) ? payment.amount_minor - payment.refunded_minor : 0
  const visibleNotes = viewer === 'client' ? notes.filter((n) => n.shared_with_client) : notes
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(t('title') + ' ' + appt.reference)}&dates=${new Date(appt.starts_at).toISOString().replace(/[-:]|\.\d{3}/g, '')}/${new Date(appt.ends_at).toISOString().replace(/[-:]|\.\d{3}/g, '')}`

  async function submitNote(body: string, visibility: string) {
    'use server'
    return addAppointmentNote(id, body, visibility === 'shared')
  }

  return (
    <>
      <Breadcrumbs items={[{ label: tn(`${viewer}.appointments`), href: `/${viewer}/appointments` }, { label: appt.reference }]} />
      <PageHeader
        title={`${te(`consultation.${appt.consultation_type}`)} — ${counterpart}`}
        description={<span className="font-mono">{appt.reference}</span>}
        actions={<StatusBadge status={appt.status} label={te(`appointment.${appt.status}`)} className="text-sm" />}
      />
      {appt.status === 'DISPUTED' && dispute ? (
        <Notice tone="warning" className="mb-5" title={`${te('appointment.DISPUTED')} · ${dispute.reference}`}>
          <Link href={`/disputes/${dispute.id}`} className="font-semibold underline">
            {tc('viewDetails')}
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Section>
            <div className="mb-5 flex items-center gap-3">
              <Avatar src={viewer === 'client' ? appt.lawyer?.photo_url : appt.client?.avatar_url} name={counterpart} className="size-12" />
              <div>
                <div className="text-xs text-muted-foreground">{viewer === 'client' ? t('lawyer') : t('client')}</div>
                <div className="font-bold">
                  {viewer === 'client' && appt.lawyer ? (
                    <Link href={`/lawyers/${appt.lawyer.slug}`} className="hover:text-gold">
                      {counterpart}
                    </Link>
                  ) : (
                    counterpart
                  )}
                </div>
                {viewer === 'lawyer' && appt.client?.phone ? <div className="ltr-nums text-xs text-muted-foreground">{appt.client.phone}</div> : null}
              </div>
            </div>
            <DescriptionList
              items={[
                {
                  label: (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> {t('when')}
                    </span>
                  ),
                  value: appt.occupies_slot ? formatDateTime(appt.starts_at, locale, tz) : t('writtenDue', { date: formatDateTime(appt.ends_at, locale, tz) }),
                },
                { label: t('type'), value: te(`consultation.${appt.consultation_type}`) },
                {
                  label: (
                    <span className="flex items-center gap-1">
                      <CreditCard className="size-3.5" aria-hidden /> {t('fee')}
                    </span>
                  ),
                  value: (
                    <>
                      {appt.price_minor === 0 ? tc('free') : formatMoney(appt.price_minor, locale)}
                      {payment ? (
                        <Badge variant="muted" className="ms-2">
                          {te(`payment.${payment.status}`)}
                          {payment.provider === 'sandbox' ? ' · sandbox' : ''}
                        </Badge>
                      ) : null}
                    </>
                  ),
                },
                { label: tc('category'), value: appt.category ? pick(locale, appt.category.name_ar, appt.category.name_en) : '—' },
                ...(appt.office
                  ? [
                      {
                        label: (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden /> {t('office')}
                          </span>
                        ),
                        value: `${appt.office.label} — ${pick(locale, appt.office.address_ar, appt.office.address_en)}`,
                      },
                    ]
                  : []),
              ]}
            />
            <div className="mt-5 rounded-xl bg-muted/60 p-4">
              <div className="mb-1 text-xs font-bold text-muted-foreground">{t('issue')}</div>
              <p className="whitespace-pre-line text-sm leading-relaxed">{appt.issue_summary}</p>
            </div>
            {appt.cancellation_reason ? <p className="mt-3 text-sm text-muted-foreground">{appt.cancellation_reason}</p> : null}
          </Section>

          <Section title={t('documents')} action={['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(appt.status) ? null : <DocumentUploader target={{ appointmentId: id }} label={t('uploadDocument')} />}>
            <DocumentList documents={documents} currentUserId={userId} />
          </Section>

          <Section title={viewer === 'client' ? t('sharedNotes') : t('notes')}>
            {viewer === 'lawyer' ? (
              <div className="mb-4">
                <NoteComposer
                  placeholder={t('notePlaceholder')}
                  submitLabel={t('addNote')}
                  visibilityOptions={[
                    { value: 'private', label: t('privateBadge') },
                    { value: 'shared', label: t('shareWithClient') },
                  ]}
                  onSubmit={submitNote}
                  successMessage={t('noteSaved')}
                />
              </div>
            ) : null}
            {visibleNotes.length ? (
              <ul className="space-y-3">
                {visibleNotes.map((n) => (
                  <li key={n.id} className="rounded-xl border p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatDateTime(n.created_at, locale)}</span>
                      {viewer === 'lawyer' ? (
                        <Badge variant={n.shared_with_client ? 'info' : 'outline'}>
                          {n.shared_with_client ? (
                            t('sharedBadge')
                          ) : (
                            <>
                              <Lock aria-hidden /> {t('privateBadge')}
                            </>
                          )}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-line text-sm">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noNotes')}</p>
            )}
          </Section>

          <Section title={t('timeline')}>
            <ol className="relative space-y-4 border-s ps-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -start-[1.65rem] top-1 flex size-3 rounded-full border-2 border-card bg-gold" aria-hidden />
                  <div className="text-sm font-semibold">
                    {t.has(`event.${e.event_type}` as 'event.created') ? t(`event.${e.event_type}` as 'event.created') : e.event_type}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(e.created_at, locale)}</div>
                </li>
              ))}
              {events.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  <History className="inline size-4" aria-hidden /> —
                </li>
              ) : null}
            </ol>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <AppointmentActions
              viewer={viewer}
              appointment={{
                id: appt.id,
                status: appt.status,
                startsAt: appt.starts_at,
                endsAt: appt.ends_at,
                occupiesSlot: appt.occupies_slot,
                consultationType: appt.consultation_type,
                lawyerId: appt.lawyer_id,
                timezone: tz,
                deadlineHours: appt.lawyer?.cancellation_deadline_hours ?? 24,
                matterId: appt.matter_id,
                reference: appt.reference,
                holdExpiresAt: appt.hold_expires_at,
                completedAt: appt.completed_at,
              }}
              paidMinor={paidMinor}
              latePercent={latePercent}
              conversationId={conversationId}
              hasReview={Boolean(review)}
              hasOpenDispute={Boolean(dispute && !['resolved', 'rejected', 'closed'].includes(dispute.status))}
              offerings={offerings}
              today={cairoDate()}
            />
          </section>
          {appt.occupies_slot && ['CONFIRMED', 'PENDING_CONFIRMATION'].includes(appt.status) ? (
            <section className="rounded-xl border bg-card p-4 text-sm shadow-soft">
              <div className="mb-2 flex items-center gap-1.5 font-bold">
                <CalendarPlus className="size-4 text-gold" aria-hidden /> {t('addToCalendar')}
              </div>
              <div className="flex flex-col gap-1.5">
                <a href={`/api/appointments/${appt.id}/ics`} className="text-gold hover:underline">
                  {t('downloadIcs')}
                </a>
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                  {t('googleCalendar')}
                </a>
              </div>
            </section>
          ) : null}
          {review ? (
            <section className="rounded-xl border bg-card p-4 text-sm shadow-soft">
              <div className="flex items-center gap-1.5 font-bold">
                <ScrollText className="size-4 text-gold" aria-hidden /> {t('reviewed')}
              </div>
              <div className="mt-1 text-muted-foreground">
                {review.rating}/5 · {te(`review.${review.status}`)}
              </div>
            </section>
          ) : null}
          <p className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
            <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {tc('disclaimer')}
          </p>
        </aside>
      </div>
    </>
  )
}
