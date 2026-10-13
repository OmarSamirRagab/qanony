import { SearchX, SlidersHorizontal } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader } from '@/components/shared'
import { AutoSubmitSelect } from '@/components/shared/auto-submit'
import { CollapsiblePanel } from '@/components/shared/collapsible-panel'
import { NotConfiguredNotice } from '@/components/shared/notices'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { LawyerCard } from '@/features/lawyers/components/lawyer-card'
import { searchLawyers } from '@/features/lawyers/queries'
import { parseLawyerSearch } from '@/features/lawyers/search-params'
import { getCategories, getCities, getConsultationTypes, getGovernorates } from '@/features/reference/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { isSupabaseConfigured } from '@/lib/env'
import { cairoDate } from '@/lib/format'
import { pick } from '@/lib/utils'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'lawyers.list' })
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: { canonical: getPathname({ href: '/lawyers', locale: toLocale(locale) }) } }
}

export default async function LawyersPage({ params, searchParams }: Props) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const sp = await searchParams
  const filters = parseLawyerSearch(sp)
  const t = await getTranslations('lawyers.list')
  const tc = await getTranslations('common')
  const te = await getTranslations('enums')
  const [{ rows, total }, categories, governorates, cities, types] = await Promise.all([
    searchLawyers({ ...filters, pageSize: 12 }),
    getCategories(),
    getGovernorates(),
    getCities(),
    getConsultationTypes(),
  ])
  const action = getPathname({ href: '/lawyers', locale })
  const govCities = filters.governorate ? cities.filter((c) => c.governorate_id === filters.governorate) : []
  const hasFilters = Object.entries(filters).some(([k, v]) => !['sort', 'page', 'online'].includes(k) && v != null && v !== '') || filters.online

  const filterFields = (
    <div className="space-y-4">
      <Field label={t('filterCategory')}>
        <NativeSelect name="category" defaultValue={filters.category ?? ''}>
          <option value="">{tc('all')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {pick(locale, c.name_ar, c.name_en)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('filterGovernorate')}>
        <NativeSelect name="governorate" defaultValue={filters.governorate ?? ''}>
          <option value="">{tc('all')}</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {pick(locale, g.name_ar, g.name_en)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {govCities.length ? (
        <Field label={t('filterCity')}>
          <NativeSelect name="city" defaultValue={filters.city ?? ''}>
            <option value="">{tc('all')}</option>
            {govCities.map((c) => (
              <option key={c.id} value={c.id}>
                {pick(locale, c.name_ar, c.name_en)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label={t('filterType')}>
        <NativeSelect name="type" defaultValue={filters.type ?? ''}>
          <option value="">{tc('all')}</option>
          {types.map((ct) => (
            <option key={ct.code} value={ct.code}>
              {te(`consultation.${ct.code}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('filterPrice')}>
        <div className="grid grid-cols-2 gap-2">
          <Input name="minPrice" type="number" min={0} inputMode="numeric" placeholder={t('minPrice')} defaultValue={filters.minPrice ?? ''} aria-label={t('minPrice')} />
          <Input name="maxPrice" type="number" min={0} inputMode="numeric" placeholder={t('maxPrice')} defaultValue={filters.maxPrice ?? ''} aria-label={t('maxPrice')} />
        </div>
      </Field>
      <Field label={t('filterExperience')}>
        <NativeSelect name="minExperience" defaultValue={filters.minExperience ?? ''}>
          <option value="">{t('experienceAny')}</option>
          {[3, 5, 10, 15, 20].map((y) => (
            <option key={y} value={y}>
              {t('experienceMin', { years: y })}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('filterRating')}>
        <NativeSelect name="minRating" defaultValue={filters.minRating ?? ''}>
          <option value="">{t('ratingAny')}</option>
          {[3, 4, 4.5].map((r) => (
            <option key={r} value={r}>
              {t('ratingMin', { rating: r })}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('filterAvailability')}>
        <Input name="availableOn" type="date" min={cairoDate()} defaultValue={filters.availableOn ?? ''} />
      </Field>
      <Field label={t('filterTimeOfDay')}>
        <NativeSelect name="timeOfDay" defaultValue={filters.timeOfDay ?? ''}>
          <option value="">{tc('all')}</option>
          {(['morning', 'afternoon', 'evening'] as const).map((v) => (
            <option key={v} value={v}>
              {te(`timeOfDay.${v}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t('filterLanguage')}>
        <NativeSelect name="language" defaultValue={filters.language ?? ''}>
          <option value="">{tc('all')}</option>
          <option value="ar">{tc('arabic')}</option>
          <option value="en">{tc('english')}</option>
          <option value="fr">Français</option>
        </NativeSelect>
      </Field>
      <Field label={t('filterGender')} hint={t('genderHint')}>
        <NativeSelect name="gender" defaultValue={filters.gender ?? ''}>
          <option value="">{tc('all')}</option>
          <option value="female">{te('gender.female')}</option>
          <option value="male">{te('gender.male')}</option>
        </NativeSelect>
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="online" value="1" defaultChecked={filters.online} className="size-4 accent-[var(--color-gold)]" />
        {t('filterOnline')}
      </label>
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1">
          {t('showResults')}
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link href="/lawyers">{tc('clearFilters')}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {!isSupabaseConfigured ? <NotConfiguredNotice className="mb-6" /> : null}
      <form action={action} method="get" className="grid gap-6 lg:grid-cols-[280px_1fr]" role="search">
        <aside>
          <CollapsiblePanel label={tc('filters')} defaultOpen={hasFilters} className="lg:sticky lg:top-24">
            <div className="rounded-2xl border bg-card p-5 shadow-soft">
              <h2 className="mb-4 hidden items-center gap-2 font-bold lg:flex">
                <SlidersHorizontal className="size-4 text-gold" aria-hidden /> {tc('filters')}
              </h2>
              {filterFields}
            </div>
          </CollapsiblePanel>
        </aside>
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input name="q" defaultValue={filters.q ?? ''} placeholder={t('searchPlaceholder')} className="h-11 flex-1" aria-label={t('searchPlaceholder')} />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">{t('sort')}</span>
              <AutoSubmitSelect name="sort" defaultValue={filters.sort} className="h-11 min-w-44" aria-label={t('sort')}>
                <option value="relevance">{t('sortRelevance')}</option>
                <option value="soonest">{t('sortSoonest')}</option>
                <option value="price_asc">{t('sortPriceAsc')}</option>
                <option value="price_desc">{t('sortPriceDesc')}</option>
                <option value="experience">{t('sortExperience')}</option>
                <option value="rating">{t('sortRating')}</option>
              </AutoSubmitSelect>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{tc('results', { count: total })}</span>
            <span className="hidden text-xs sm:block">{t('sponsoredNote')}</span>
          </div>
          {rows.length ? (
            <div className="grid gap-5 xl:grid-cols-2">
              {rows.map((l) => (
                <LawyerCard key={l.id} lawyer={l} governorates={governorates} />
              ))}
            </div>
          ) : (
            <EmptyState icon={SearchX} title={t('emptyTitle')} description={t('emptyBody')} />
          )}
          <Pagination page={filters.page ?? 1} pageSize={12} total={total} basePath="/lawyers" searchParams={sp} />
        </div>
      </form>
    </Container>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
