import { BadgeCheck, Briefcase, Building2, CalendarCheck, Clock, GraduationCap, Languages, MapPin, MessageSquareLock, ScrollText, Star } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, RatingStars, Section } from '@/components/shared'
import { Breadcrumbs, VerifiedBadge } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { FavoriteButton } from '@/features/lawyers/components/favorite-button'
import { getLawyerBySlug } from '@/features/lawyers/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatMoney } from '@/lib/domain/money'
import { siteUrl } from '@/lib/env'
import { formatDate, formatDateTime } from '@/lib/format'
import { pick } from '@/lib/utils'

export const revalidate = 300

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  const data = await getLawyerBySlug(slug)
  if (!data) return {}
  const name = pick(locale, data.lawyer.display_name_ar, data.lawyer.display_name_en)
  const title = pick(locale, data.lawyer.title_ar ?? '', data.lawyer.title_en)
  return {
    title: `${name}${title ? ` — ${title}` : ''}`,
    description: (pick(locale, data.lawyer.bio_ar ?? '', data.lawyer.bio_en) || title).slice(0, 160),
    alternates: { canonical: getPathname({ href: `/lawyers/${slug}`, locale }) },
    openGraph: { type: 'profile', title: name, images: data.lawyer.photo_url ? [data.lawyer.photo_url] : undefined },
  }
}

export default async function LawyerProfilePage({ params }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const data = await getLawyerBySlug(slug)
  if (!data) notFound()
  const { lawyer, specializations, offerings, offices, credentials, reviews, services } = data
  const t = await getTranslations('lawyers.profile')
  const tl = await getTranslations('lawyers')
  const tc = await getTranslations('common')
  const te = await getTranslations('enums')
  const tn = await getTranslations('nav.public')
  const name = pick(locale, lawyer.display_name_ar, lawyer.display_name_en)
  const bio = pick(locale, lawyer.bio_ar ?? '', lawyer.bio_en)
  const education = (Array.isArray(lawyer.education) ? lawyer.education : []) as { degree?: string; institution?: string; year?: number }[]
  const verified = lawyer.verification_status === 'verified'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Attorney',
    name,
    url: siteUrl(getPathname({ href: `/lawyers/${slug}`, locale })),
    image: lawyer.photo_url ?? undefined,
    description: bio.slice(0, 300) || undefined,
    areaServed: { '@type': 'Country', name: 'Egypt' },
    knowsLanguage: lawyer.languages,
    address: lawyer.governorate ? { '@type': 'PostalAddress', addressRegion: pick(locale, lawyer.governorate.name_ar, lawyer.governorate.name_en), addressCountry: 'EG' } : undefined,
    aggregateRating: lawyer.rating_count > 0 ? { '@type': 'AggregateRating', ratingValue: Number(lawyer.rating_avg), reviewCount: lawyer.rating_count, bestRating: 5 } : undefined,
  }

  return (
    <Container className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: tn('lawyers'), href: '/lawyers' }, { label: name }]} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {/* Header card */}
          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <div className="flex flex-col gap-5 sm:flex-row">
              <Avatar src={lawyer.photo_url} name={name} className="size-28 rounded-2xl ring-4 ring-gold/20" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{name}</h1>
                  {verified ? <VerifiedBadge /> : null}
                </div>
                <p className="mt-1 text-muted-foreground">{pick(locale, lawyer.title_ar ?? '', lawyer.title_en)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {lawyer.rating_count > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <RatingStars value={Number(lawyer.rating_avg)} />
                      <span className="font-bold text-foreground">{Number(lawyer.rating_avg).toFixed(1)}</span>({tc('reviewsCount', { count: lawyer.rating_count })})
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="size-4" aria-hidden /> {tc('years', { count: lawyer.years_experience })}
                  </span>
                  {lawyer.governorate ? (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden />
                      {pick(locale, lawyer.governorate.name_ar, lawyer.governorate.name_en)}
                      {lawyer.city ? ` · ${pick(locale, lawyer.city.name_ar, lawyer.city.name_en)}` : ''}
                    </span>
                  ) : null}
                  {lawyer.completed_consultations > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <CalendarCheck className="size-4" aria-hidden /> {t('completed')}: {lawyer.completed_consultations}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {specializations.map((s) => (
                    <Link key={s.id} href={`/categories/${s.slug}`}>
                      <Badge variant={s.is_primary ? 'gold' : 'secondary'}>{pick(locale, s.name_ar, s.name_en)}</Badge>
                    </Link>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <FavoriteButton lawyerId={lawyer.id} />
                </div>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-gold-soft/60 p-3 text-xs text-accent-foreground">
              <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {verified ? t('verifiedExplain') : t('notVerified')}
            </p>
          </section>

          {bio ? (
            <Section title={t('about')}>
              <p className="whitespace-pre-line leading-relaxed">{bio}</p>
            </Section>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Section title={t('education')}>
              {education.length ? (
                <ul className="space-y-3">
                  {education.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <GraduationCap className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                      <div>
                        <div className="font-semibold">{e.degree}</div>
                        <div className="text-sm text-muted-foreground">
                          {e.institution}
                          {e.year ? ` · ${e.year}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </Section>
            <Section title={t('credentials')}>
              <ul className="space-y-3 text-sm">
                {lawyer.bar_admission_level ? (
                  <li className="flex gap-3">
                    <ScrollText className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                    <div>
                      <div className="font-semibold">{t('barLevel')}</div>
                      <div className="text-muted-foreground">{te(`barLevel.${lawyer.bar_admission_level as 'general'}`)}</div>
                    </div>
                  </li>
                ) : null}
                {lawyer.bar_number_public ? (
                  <li className="flex gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                    <div>
                      <div className="font-semibold">{t('barNumber')}</div>
                      <div className="ltr-nums text-muted-foreground">{lawyer.bar_number_public}</div>
                    </div>
                  </li>
                ) : null}
                {credentials.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                    <div>
                      <div className="font-semibold">{c.title}</div>
                      <div className="text-muted-foreground">
                        {c.issuer}
                        {c.issued_on ? ` · ${formatDate(c.issued_on, locale, { day: undefined, month: undefined })}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
                <li className="flex gap-3">
                  <Languages className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
                  <div>
                    <div className="font-semibold">{t('languages')}</div>
                    <div className="text-muted-foreground">{lawyer.languages.map((l) => (l === 'ar' ? tc('arabic') : l === 'en' ? tc('english') : l)).join('، ')}</div>
                  </div>
                </li>
              </ul>
            </Section>
          </div>

          {offices.length || lawyer.firm ? (
            <Section title={t('location')}>
              <div className="space-y-3 text-sm">
                {lawyer.firm ? (
                  <Link href={`/firms/${lawyer.firm.slug}`} className="flex items-center gap-2 font-semibold hover:text-gold">
                    <Building2 className="size-4 text-gold" aria-hidden /> {t('firm')}: {pick(locale, lawyer.firm.name_ar, lawyer.firm.name_en)}
                  </Link>
                ) : null}
                {offices.map((o) => (
                  <div key={o.id} className="flex gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                    <div>
                      <div className="font-semibold">{o.label}</div>
                      <div className="text-muted-foreground">{pick(locale, o.address_ar, o.address_en)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {services.length ? (
            <Section title={t('services')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {services.map((s) => (
                  <Link key={s.id} href={`/services/${s.slug}`} className="rounded-xl border p-4 transition-colors hover:border-gold/50 hover:bg-muted/50">
                    <div className="font-semibold">{pick(locale, s.title_ar, s.title_en)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatMoney(s.price_minor, locale)} · {tc('days', { count: s.estimated_days })}
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title={`${t('reviews')} (${reviews.length})`} description={t('responseNote')}>
            {reviews.length ? (
              <ul className="divide-y">
                {reviews.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RatingStars value={r.rating} />
                        <span className="text-sm font-semibold">{r.display_name ?? t('anonymousClient')}</span>
                        <Badge variant="success" className="text-[10px]">
                          <BadgeCheck aria-hidden /> {t('verifiedBooking')}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(r.published_at, locale)}</span>
                    </div>
                    {r.comment ? <p className="mt-2 text-sm leading-relaxed">{r.comment}</p> : null}
                    {r.lawyer_response ? (
                      <div className="mt-3 rounded-lg border-s-2 border-gold bg-muted/60 p-3 text-sm">
                        <div className="mb-1 text-xs font-bold text-gold">{t('lawyerResponse')}</div>
                        {r.lawyer_response}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Star} title={t('noReviews')} className="border-0 py-6" />
            )}
          </Section>
        </div>

        {/* Booking sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border bg-card p-5 shadow-lift">
            <h2 className="font-bold">{t('bookTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('bookSubtitle')}</p>
            <ul className="mt-4 space-y-2">
              {offerings.map((o) => (
                <li key={o.consultation_type}>
                  <Link
                    href={`/book/${slug}?type=${o.consultation_type}`}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:border-gold/60 hover:bg-gold-soft/40"
                  >
                    <div>
                      <div className="text-sm font-semibold">{te(`consultation.${o.consultation_type}`)}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" aria-hidden /> {t('minutes', { count: o.duration_minutes })}
                      </div>
                    </div>
                    <div className="text-sm font-bold">{o.price_minor === 0 ? tc('free') : formatMoney(o.price_minor, locale)}</div>
                  </Link>
                </li>
              ))}
            </ul>
            {offerings.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{tl('card.noAvailability')}</p> : null}
            {lawyer.next_available_at ? (
              <p className="mt-4 text-xs text-muted-foreground">{tl('card.nextAvailable', { when: formatDateTime(lawyer.next_available_at, locale) })}</p>
            ) : null}
            <Button asChild variant="gold" size="lg" className="mt-4 w-full" disabled={offerings.length === 0}>
              <Link href={`/book/${slug}`}>{t('book')}</Link>
            </Button>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <MessageSquareLock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('message')}
            </p>
          </section>
        </aside>
      </div>
    </Container>
  )
}
