import { CalendarX } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader } from '@/components/shared'
import { Breadcrumbs } from '@/components/shared/server'
import { BookingWizard } from '@/features/booking/components/booking-wizard'
import { getLawyerBySlug } from '@/features/lawyers/queries'
import { getCategories, getPublicSettings } from '@/features/reference/queries'
import { toLocale } from '@/i18n/routing'
import { getUserContext } from '@/lib/auth'
import { cairoDate } from '@/lib/format'
import { pick } from '@/lib/utils'
import type { Enums } from '@/types/database'

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ type?: string }> }

export const metadata: Metadata = { robots: { index: false } }

export default async function BookPage({ params, searchParams }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const { type } = await searchParams
  const data = await getLawyerBySlug(slug)
  if (!data) notFound()
  const t = await getTranslations('booking')
  const tc = await getTranslations('common')
  const tn = await getTranslations('nav.public')
  const [categories, settings, ctx] = await Promise.all([getCategories(), getPublicSettings(), getUserContext()])
  const { lawyer, offerings, offices, specializations } = data
  const name = pick(locale, lawyer.display_name_ar, lawyer.display_name_en)
  const booking = (settings.booking ?? {}) as { payment_hold_minutes?: number; written_opinion_days?: number }
  const refund = (settings.refund_policy ?? {}) as { late_cancel_refund_percent?: number }
  const initialType = offerings.some((o) => o.consultation_type === type) ? (type as Enums<'consultation_kind'>) : undefined
  // Show the lawyer's own practice areas first.
  const specIds = new Set(specializations.map((s) => s.id))
  const orderedCategories = [...categories].sort((a, b) => Number(specIds.has(b.id)) - Number(specIds.has(a.id)))

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: tn('lawyers'), href: '/lawyers' }, { label: name, href: `/lawyers/${slug}` }, { label: t('title') }]} />
      <PageHeader title={t('metaTitle', { name })} />
      {offerings.length === 0 ? (
        <EmptyState icon={CalendarX} title={t('unavailableTitle')} description={t('unavailableBody')} />
      ) : (
        <BookingWizard
          lawyer={{ id: lawyer.id, slug, name, timezone: lawyer.timezone, cancellationDeadlineHours: lawyer.cancellation_deadline_hours }}
          offerings={offerings}
          offices={offices.map((o) => ({ id: o.id, label: o.label, address: pick(locale, o.address_ar, o.address_en) }))}
          categories={orderedCategories.map((c) => ({ id: c.id, name: pick(locale, c.name_ar, c.name_en) }))}
          initialType={initialType}
          today={cairoDate()}
          holdMinutes={booking.payment_hold_minutes ?? 15}
          writtenOpinionDays={booking.written_opinion_days ?? 3}
          latePercent={refund.late_cancel_refund_percent ?? 50}
          viewer={!ctx ? 'anonymous' : ctx.roles.includes('client') ? 'client' : 'not_client'}
        />
      )}
    </Container>
  )
}
