import { Clock, Tags } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader, RatingStars } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { getPublicServices } from '@/features/content/queries'
import { getCategories } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatMoney } from '@/lib/domain/money'
import { pick } from '@/lib/utils'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'content.services' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function ServicesPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('content.services')
  const tc = await getTranslations('common')
  const [{ rows, total }, categories] = await Promise.all([getPublicServices({ q: sp.q, category: sp.category, page }), getCategories()])
  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <form action={getPathname({ href: '/services', locale })} className="mb-6 flex flex-col gap-3 sm:flex-row" role="search">
        <Input name="q" defaultValue={sp.q} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} className="h-11" />
        <div className="sm:w-64">
          <NativeSelect name="category" defaultValue={sp.category ?? ''} className="h-11" aria-label={tc('category')}>
            <option value="">{tc('all')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {pick(locale, c.name_ar, c.name_en)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="lg">
          {tc('search')}
        </Button>
      </form>
      {rows.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <Link key={s.id} href={`/services/${s.slug}`} className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
              {s.category ? <Badge variant="secondary" className="mb-3 self-start">{pick(locale, s.category.name_ar, s.category.name_en)}</Badge> : null}
              <h2 className="font-bold leading-snug">{pick(locale, s.title_ar, s.title_en)}</h2>
              <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{pick(locale, s.description_ar, s.description_en)}</p>
              <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
                <span className="text-muted-foreground">
                  {s.lawyer ? pick(locale, s.lawyer.display_name_ar, s.lawyer.display_name_en) : ''}
                  {s.lawyer && s.lawyer.rating_count > 0 ? <RatingStars value={Number(s.lawyer.rating_avg)} className="ms-1" /> : null}
                </span>
                <span className="text-end">
                  <span className="block font-bold">{formatMoney(s.price_minor, locale)}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" aria-hidden /> {t('days', { count: s.estimated_days })}
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Tags} title={t('empty')} />
      )}
      <Pagination page={page} pageSize={12} total={total} basePath="/services" searchParams={sp} />
    </Container>
  )
}
