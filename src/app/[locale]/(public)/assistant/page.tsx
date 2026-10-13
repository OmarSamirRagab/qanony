import { Bot } from 'lucide-react'
import type { Metadata } from 'next'
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server'
import { Container } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { AssistantChat } from '@/features/ai/components/assistant-chat'
import { getCategories } from '@/features/reference/queries'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { getUserContext } from '@/lib/auth'
import { isAiConfigured } from '@/lib/providers/ai/anthropic'
import { pick } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'ai.assistant' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale))
  const t = await getTranslations('ai.assistant')
  const locale = await getLocale()
  const [ctx, categories] = await Promise.all([getUserContext(), getCategories()])
  return (
    <Container className="max-w-3xl py-10">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-navy text-gold">
          <Bot className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>
      <Notice tone="warning" className="mb-4" title={t('disclaimer')}>
        {t('privacyNote')}
      </Notice>
      {!isAiConfigured() ? (
        <Notice tone="info" title={t('unavailable')} />
      ) : !ctx ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="mb-4">{t('loginRequired')}</p>
          <Button asChild variant="gold">
            <Link href="/login?next=/assistant">{t('login')}</Link>
          </Button>
        </div>
      ) : (
        <AssistantChat categoryNames={Object.fromEntries(categories.map((c) => [c.slug, pick(locale, c.name_ar, c.name_en)]))} />
      )}
    </Container>
  )
}
