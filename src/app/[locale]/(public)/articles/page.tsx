import { BookOpen } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, EmptyState, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { getArticles } from '@/features/content/queries'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatDate } from '@/lib/format'
import { pick } from '@/lib/utils'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.articles' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const t = await getTranslations('content.articles')
  const articles = await getArticles(60)
  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {articles.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a) => (
            <Link key={a.id} href={`/articles/${a.slug}`} className="group flex flex-col rounded-2xl border bg-card p-6 shadow-soft hover:shadow-lift">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="gold">{t(a.kind === 'guide' ? 'guide' : 'article')}</Badge>
                {a.category ? <Badge variant="secondary">{pick(locale, a.category.name_ar, a.category.name_en)}</Badge> : null}
              </div>
              <h2 className="font-bold leading-snug group-hover:text-gold">{pick(locale, a.title_ar, a.title_en)}</h2>
              <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{pick(locale, a.excerpt_ar ?? '', a.excerpt_en)}</p>
              <span className="mt-4 text-xs text-muted-foreground">{t('published', { date: formatDate(a.published_at, locale) })}</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title={t('empty')} />
      )}
    </Container>
  )
}
