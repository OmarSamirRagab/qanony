import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, PageHeader } from '@/components/shared'
import { CategoryIcon } from '@/features/reference/category-icon'
import { getCategories } from '@/features/reference/queries'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { pick } from '@/lib/utils'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'lawyers.categories' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const t = await getTranslations('lawyers.categories')
  const categories = await getCategories()
  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Link key={c.id} href={`/categories/${c.slug}`} className="group flex gap-4 rounded-2xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-lift">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary group-hover:bg-gold-soft group-hover:text-gold dark:bg-secondary dark:text-gold">
              <CategoryIcon name={c.icon} className="size-6" />
            </span>
            <span>
              <span className="block font-bold">{pick(locale, c.name_ar, c.name_en)}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{pick(locale, c.description_ar ?? '', c.description_en)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Container>
  )
}
