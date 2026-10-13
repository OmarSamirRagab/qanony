import { BadgeCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState } from '@/components/shared'
import { LegalDisclaimer } from '@/components/shared/notices'
import { Breadcrumbs } from '@/components/shared/server'
import { Button } from '@/components/ui/button'
import { getArticles, getPublicServices } from '@/features/content/queries'
import { LawyerCard } from '@/features/lawyers/components/lawyer-card'
import { searchLawyers } from '@/features/lawyers/queries'
import { CategoryIcon } from '@/features/reference/category-icon'
import { getCategories, getGovernorates } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatMoney } from '@/lib/domain/money'
import { pick } from '@/lib/utils'

export const revalidate = 300
type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  const c = (await getCategories()).find((x) => x.slug === slug)
  if (!c) return {}
  const t = await getTranslations({ locale, namespace: 'lawyers.categories' })
  return { title: t('lawyersIn', { name: pick(locale, c.name_ar, c.name_en) }), description: pick(locale, c.description_ar ?? '', c.description_en), alternates: { canonical: getPathname({ href: `/categories/${slug}`, locale }) } }
}

export default async function CategoryPage({ params }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const c = (await getCategories()).find((x) => x.slug === slug)
  if (!c) notFound()
  const t = await getTranslations('lawyers')
  const tc = await getTranslations('common')
  const name = pick(locale, c.name_ar, c.name_en)
  const [{ rows }, governorates, services, articles] = await Promise.all([searchLawyers({ category: slug, pageSize: 6 }), getGovernorates(), getPublicServices({ category: slug, pageSize: 4 }), getArticles(50)])
  const related = articles.filter((a) => a.category?.slug === slug).slice(0, 3)
  return (
    <>
      <section className="bg-navy text-navy-foreground">
        <Container className="py-12">
          <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: t('categories.title'), href: '/categories' }, { label: name }]} />
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gold text-gold-foreground">
              <CategoryIcon name={c.icon} className="size-7" />
            </span>
            <div>
              <h1 className="font-display text-3xl font-bold text-white">{t('categories.lawyersIn', { name })}</h1>
              <p className="mt-1 max-w-2xl text-white/70">{pick(locale, c.description_ar ?? '', c.description_en)}</p>
            </div>
          </div>
        </Container>
      </section>
      <Container className="space-y-10 py-10">
        {rows.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((l) => (
              <LawyerCard key={l.id} lawyer={l} governorates={governorates} />
            ))}
          </div>
        ) : (
          <EmptyState icon={BadgeCheck} title={t('list.emptyTitle')} />
        )}
        <div className="text-center">
          <Button asChild size="lg">
            <Link href={`/lawyers?category=${slug}`}>{t('categories.browseLawyers')}</Link>
          </Button>
        </div>
        {services.rows.length ? (
          <section>
            <h2 className="mb-4 text-xl font-bold">{t('categories.servicesIn', { name })}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {services.rows.map((s) => (
                <Link key={s.id} href={`/services/${s.slug}`} className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-soft hover:border-gold/50">
                  <span className="font-semibold">{pick(locale, s.title_ar, s.title_en)}</span>
                  <span className="font-bold">{formatMoney(s.price_minor, locale)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {related.length ? (
          <section>
            <h2 className="mb-4 text-xl font-bold">{t('categories.guidesIn', { name })}</h2>
            <ul className="space-y-2">
              {related.map((a) => (
                <li key={a.id}>
                  <Link href={`/articles/${a.slug}`} className="font-semibold text-gold hover:underline">
                    {pick(locale, a.title_ar, a.title_en)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <LegalDisclaimer />
      </Container>
    </>
  )
}
