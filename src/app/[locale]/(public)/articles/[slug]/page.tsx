import { BadgeCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container } from '@/components/shared'
import { Markdown } from '@/components/shared/markdown'
import { LegalDisclaimer } from '@/components/shared/notices'
import { Breadcrumbs } from '@/components/shared/server'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getArticle } from '@/features/content/queries'
import { getPathname, Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { siteUrl } from '@/lib/env'
import { formatDate } from '@/lib/format'
import { pick } from '@/lib/utils'

export const revalidate = 300
type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  const a = await getArticle(slug)
  if (!a) return {}
  return {
    title: pick(locale, a.title_ar, a.title_en),
    description: pick(locale, a.excerpt_ar ?? '', a.excerpt_en),
    alternates: { canonical: getPathname({ href: `/articles/${slug}`, locale }) },
    openGraph: { type: 'article', publishedTime: a.published_at ?? undefined, images: a.cover_image_url ? [a.cover_image_url] : undefined },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { locale: raw, slug } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const a = await getArticle(slug)
  if (!a) notFound()
  const t = await getTranslations('content.articles')
  const tc = await getTranslations('common')
  const tn = await getTranslations('nav.public')
  const title = pick(locale, a.title_ar, a.title_en)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    datePublished: a.published_at,
    dateModified: a.updated_at,
    inLanguage: locale,
    mainEntityOfPage: siteUrl(getPathname({ href: `/articles/${slug}`, locale })),
    publisher: { '@type': 'Organization', name: tc('brand') },
  }
  return (
    <Container className="max-w-3xl py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Breadcrumbs items={[{ label: tc('home'), href: '/' }, { label: tn('articles'), href: '/articles' }, { label: title }]} />
      <article>
        <header className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="gold">{t(a.kind === 'guide' ? 'guide' : 'article')}</Badge>
            {a.reviewed_by_lawyer ? (
              <Badge variant="success">
                <BadgeCheck aria-hidden /> {t('reviewedByLawyer')}
              </Badge>
            ) : null}
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t('published', { date: formatDate(a.published_at, locale) })}</p>
        </header>
        <Markdown source={pick(locale, a.body_ar, a.body_en)} />
        {a.sources.length ? (
          <section className="mt-8 border-t pt-4">
            <h2 className="mb-2 text-sm font-bold">{t('sources')}</h2>
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              {a.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      <LegalDisclaimer className="mt-8" />
      <div className="mt-8 rounded-2xl bg-navy p-6 text-navy-foreground">
        <div className="font-bold text-white">{t('related')}</div>
        <Button asChild variant="gold" className="mt-3">
          <Link href={a.category ? `/lawyers?category=${a.category.slug}` : '/lawyers'}>{t('relatedCta')}</Link>
        </Button>
      </div>
    </Container>
  )
}
