import { BadgeCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader } from '@/components/shared'
import { Breadcrumbs } from '@/components/shared/server'
import { Button } from '@/components/ui/button'
import { LawyerCard } from '@/features/lawyers/components/lawyer-card'
import { searchLawyers } from '@/features/lawyers/queries'
import { getCategories, getGovernorates } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { pick } from '@/lib/utils'

export const revalidate = 600
type Props = { params: Promise<{ locale: string; governorate: string }> }

async function findGov(code: string) {
  return (await getGovernorates()).find((g) => g.code.toLowerCase() === code.toLowerCase())
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, governorate } = await params
  const locale = toLocale(raw)
  const g = await findGov(governorate)
  if (!g) return {}
  const t = await getTranslations({ locale, namespace: 'lawyers.cities' })
  const name = pick(locale, g.name_ar, g.name_en)
  return { title: t('title', { name }), description: t('metaDescription', { name }), alternates: { canonical: getPathname({ href: `/cities/${g.code.toLowerCase()}`, locale }) } }
}

export default async function CityPage({ params }: Props) {
  const { locale: raw, governorate } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const g = await findGov(governorate)
  if (!g) notFound()
  const t = await getTranslations('lawyers')
  const tc = await getTranslations('common')
  const name = pick(locale, g.name_ar, g.name_en)
  const [{ rows }, governorates, categories] = await Promise.all([searchLawyers({ governorate: g.id, pageSize: 9 }), getGovernorates(), getCategories()])
  return (
    <Container className="py-10">
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: name }]} />
      <PageHeader title={t('cities.title', { name })} description={t('cities.subtitle', { name })} />
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.slice(0, 10).map((c) => (
          <Link key={c.id} href={`/lawyers?governorate=${g.id}&category=${c.slug}`} className="rounded-full border bg-card px-3 py-1 text-sm hover:border-gold">
            {pick(locale, c.name_ar, c.name_en)}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((l) => (
            <LawyerCard key={l.id} lawyer={l} governorates={governorates} />
          ))}
        </div>
      ) : (
        <EmptyState icon={BadgeCheck} title={t('list.emptyTitle')} />
      )}
      <div className="mt-8 text-center">
        <Button asChild>
          <Link href={`/lawyers?governorate=${g.id}`}>{t('categories.browseLawyers')}</Link>
        </Button>
      </div>
    </Container>
  )
}
