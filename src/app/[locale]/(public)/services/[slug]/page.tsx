import { Check, Clock, FileText, RotateCcw, Undo2 } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, RatingStars, Section } from '@/components/shared'
import { LegalDisclaimer } from '@/components/shared/notices'
import { Breadcrumbs } from '@/components/shared/server'
import { Avatar } from '@/components/ui/primitives'
import { getServiceBySlug } from '@/features/content/queries'
import { OrderServiceForm } from '@/features/orders/components/order-service-form'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { getUserContext } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { siteUrl } from '@/lib/env'
import { pick } from '@/lib/utils'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  const s = await getServiceBySlug(slug)
  if (!s) return {}
  return {
    title: pick(locale, s.title_ar, s.title_en),
    description: pick(locale, s.description_ar, s.description_en).slice(0, 160),
    alternates: { canonical: getPathname({ href: `/services/${slug}`, locale }) },
  }
}

export default async function ServicePage({ params }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const s = await getServiceBySlug(slug)
  if (!s) notFound()
  const t = await getTranslations('content.services')
  const tc = await getTranslations('common')
  const tn = await getTranslations('nav.public')
  const ctx = await getUserContext()
  const title = pick(locale, s.title_ar, s.title_en)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: title,
    serviceType: 'Legal service',
    provider: s.lawyer ? { '@type': 'Attorney', name: pick(locale, s.lawyer.display_name_ar, s.lawyer.display_name_en) } : undefined,
    offers: { '@type': 'Offer', price: (s.price_minor / 100).toFixed(2), priceCurrency: 'EGP' },
    url: siteUrl(getPathname({ href: `/services/${slug}`, locale })),
  }
  return (
    <Container className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: tn('services'), href: '/services' }, { label: title }]} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{pick(locale, s.description_ar, s.description_en)}</p>
          </section>
          {s.deliverables.length ? (
            <Section title={t('deliverables')}>
              <ul className="space-y-2">
                {s.deliverables.map((d) => (
                  <li key={d} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {s.required_documents.length ? (
            <Section title={t('requiredDocuments')}>
              <ul className="space-y-2">
                {s.required_documents.map((d) => (
                  <li key={d} className="flex gap-2 text-sm">
                    <FileText className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <div className="grid gap-6 md:grid-cols-2">
            <Section title={t('revisionPolicy')}>
              <p className="flex gap-2 text-sm text-muted-foreground">
                <RotateCcw className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                {t('revisions')}: {s.revisions_included}. {s.revision_policy}
              </p>
            </Section>
            <Section title={t('refundTerms')}>
              <p className="flex gap-2 text-sm text-muted-foreground">
                <Undo2 className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                {s.refund_terms || <Link href="/refund-policy" className="underline">{tc('learnMore')}</Link>}
              </p>
            </Section>
          </div>
          <LegalDisclaimer />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border bg-card p-5 shadow-lift">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">{t('price')}</span>
              <span className="text-2xl font-bold">{formatMoney(s.price_minor, locale)}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden /> {t('estimatedTime')}: {t('days', { count: s.estimated_days })}
            </p>
            <div className="mt-5">
              <OrderServiceForm
                serviceId={s.id}
                basePrice={s.price_minor}
                baseDays={s.estimated_days}
                packages={(s.packages ?? []).filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({ id: p.id, name: pick(locale, p.name_ar, p.name_en), price_minor: p.price_minor, estimated_days: p.estimated_days }))}
                signedIn={Boolean(ctx)}
                slug={slug}
              />
            </div>
          </section>
          {s.lawyer ? (
            <Link href={`/lawyers/${s.lawyer.slug}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft hover:border-gold/50">
              <Avatar src={s.lawyer.photo_url} name={pick(locale, s.lawyer.display_name_ar, s.lawyer.display_name_en)} />
              <div>
                <div className="text-xs text-muted-foreground">{t('provider')}</div>
                <div className="font-bold">{pick(locale, s.lawyer.display_name_ar, s.lawyer.display_name_en)}</div>
                {s.lawyer.rating_count > 0 ? <RatingStars value={Number(s.lawyer.rating_avg)} /> : null}
              </div>
            </Link>
          ) : null}
        </aside>
      </div>
    </Container>
  )
}
