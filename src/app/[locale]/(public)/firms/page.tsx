import { Building2 } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { getPublicFirms } from '@/features/content/queries'
import { getGovernorates } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { pick } from '@/lib/utils'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'lawyers.firms' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function FirmsPage({ params, searchParams }: Props) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('lawyers.firms')
  const tc = await getTranslations('common')
  const [{ rows, total }, governorates] = await Promise.all([getPublicFirms({ q: sp.q, governorate: Number(sp.governorate) || undefined, page }), getGovernorates()])
  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <form action={getPathname({ href: '/firms', locale })} className="mb-6 flex flex-col gap-3 sm:flex-row" role="search">
        <Input name="q" defaultValue={sp.q} placeholder={tc('searchPlaceholder')} aria-label={tc('search')} className="h-11" />
        <div className="sm:w-64">
          <NativeSelect name="governorate" defaultValue={sp.governorate ?? ''} className="h-11" aria-label={tc('all')}>
            <option value="">{tc('all')}</option>
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {pick(locale, g.name_ar, g.name_en)}
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
          {rows.map((f) => (
            <Link key={f.id} href={`/firms/${f.slug}`} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-soft hover:shadow-lift">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy text-gold">
                {f.logo_url ? <img src={f.logo_url} alt="" className="size-full object-cover" /> : <Building2 className="size-6" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{pick(locale, f.name_ar, f.name_en)}</span>
                <span className="block text-xs text-muted-foreground">
                  {f.governorate ? pick(locale, f.governorate.name_ar, f.governorate.name_en) : ''}
                  {f.founded_year ? ` · ${t('founded', { year: f.founded_year })}` : ''}
                </span>
                <span className="mt-2 line-clamp-2 block text-sm text-muted-foreground">{pick(locale, f.description_ar ?? '', f.description_en)}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Building2} title={t('emptyTitle')} />
      )}
      <Pagination page={page} pageSize={12} total={total} basePath="/firms" searchParams={sp} />
    </Container>
  )
}
