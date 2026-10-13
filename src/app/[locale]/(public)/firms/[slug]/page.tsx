import { BadgeCheck, Building2, Globe, MapPin, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, Section } from '@/components/shared'
import { Breadcrumbs, VerifiedBadge } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { getFirmBySlug } from '@/features/content/queries'
import { LawyerCard } from '@/features/lawyers/components/lawyer-card'
import type { LawyerSearchRow } from '@/features/lawyers/queries'
import { getGovernorates } from '@/features/reference/queries'
import { getPathname } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { pick } from '@/lib/utils'

export const revalidate = 300
type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  const data = await getFirmBySlug(slug)
  if (!data) return {}
  return { title: pick(locale, data.firm.name_ar, data.firm.name_en), description: pick(locale, data.firm.description_ar ?? '', data.firm.description_en).slice(0, 160), alternates: { canonical: getPathname({ href: `/firms/${slug}`, locale }) } }
}

export default async function FirmPage({ params }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const data = await getFirmBySlug(slug)
  if (!data) notFound()
  const { firm, branches, lawyers } = data
  const t = await getTranslations('lawyers.firms')
  const tc = await getTranslations('common')
  const tn = await getTranslations('nav.public')
  const governorates = await getGovernorates()
  const name = pick(locale, firm.name_ar, firm.name_en)
  const jsonLd = { '@context': 'https://schema.org', '@type': 'LegalService', name, url: firm.website ?? undefined, areaServed: 'EG', logo: firm.logo_url ?? undefined }
  return (
    <Container className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: tn('firms'), href: '/firms' }, { label: name }]} />
      <section className="mb-6 flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-soft sm:flex-row">
        <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy text-gold">
          {firm.logo_url ? <img src={firm.logo_url} alt="" className="size-full object-cover" /> : <Building2 className="size-10" aria-hidden />}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            {firm.verification_status === 'verified' ? <VerifiedBadge /> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {firm.governorate ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {pick(locale, firm.governorate.name_ar, firm.governorate.name_en)}
              </span>
            ) : null}
            {firm.founded_year ? <span>{t('founded', { year: firm.founded_year })}</span> : null}
            {firm.website ? (
              <a href={firm.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-gold hover:underline">
                <Globe className="size-4" aria-hidden /> {t('website')}
              </a>
            ) : null}
          </div>
          {firm.description_ar ? <p className="mt-4 whitespace-pre-line leading-relaxed">{pick(locale, firm.description_ar, firm.description_en)}</p> : null}
        </div>
      </section>
      <div className="space-y-6">
        <Section title={t('lawyers')}>
          {lawyers.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {(lawyers as unknown as LawyerSearchRow[]).map((l) => (
                <LawyerCard key={l.id} lawyer={l} governorates={governorates} />
              ))}
            </div>
          ) : (
            <EmptyState icon={BadgeCheck} title={t('noLawyers')} className="border-0" />
          )}
        </Section>
        {branches.length ? (
          <Section title={t('branches')}>
            <ul className="grid gap-3 md:grid-cols-2">
              {branches.map((b) => (
                <li key={b.id} className="rounded-xl border p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    {pick(locale, b.name_ar, b.name_en)} {b.is_headquarters ? <Badge variant="gold">{t('headquarters')}</Badge> : null}
                  </div>
                  <div className="mt-1 text-muted-foreground">{pick(locale, b.address_ar, b.address_en)}</div>
                  {b.phone ? (
                    <div className="ltr-nums mt-1 flex items-center gap-1 text-muted-foreground">
                      <Phone className="size-3.5" aria-hidden /> {b.phone}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </Container>
  )
}
