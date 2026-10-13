import { getLocale, getTranslations } from 'next-intl/server'
import { Container } from '@/components/shared'
import { Markdown } from '@/components/shared/markdown'
import { Notice } from '@/components/shared/notices'
import { formatDate } from '@/lib/format'
import { pick } from '@/lib/utils'
import { getCmsPage } from '../queries'

/**
 * Legal pages render a published CMS page when one exists (admin-managed),
 * otherwise the built-in draft text — which is always flagged as requiring
 * review by qualified Egyptian counsel.
 */
export async function LegalPage({ slug, titleKey, bodyKey }: { slug: string; titleKey: 'privacyTitle' | 'termsTitle' | 'refundTitle'; bodyKey: 'privacyBody' | 'termsBody' | 'refundBody' }) {
  const t = await getTranslations('content.legal')
  const locale = await getLocale()
  const cms = await getCmsPage(slug)
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="font-display text-3xl font-bold">{cms ? pick(locale, cms.title_ar, cms.title_en) : t(titleKey)}</h1>
      {cms ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('lastUpdated', { date: formatDate(cms.updated_at, locale) })}</p>
      ) : (
        <Notice tone="warning" className="mt-4" title={t('draftNotice')} />
      )}
      <div className="mt-6">
        <Markdown source={cms ? pick(locale, cms.body_ar, cms.body_en) : t(bodyKey)} />
      </div>
    </Container>
  )
}
