import { BadgeCheck, Eye, FileLock2 } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container } from '@/components/shared'
import { toLocale } from '@/i18n/routing'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.about' })
  return { title: t('metaTitle'), description: t('body').slice(0, 160) }
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale))
  const t = await getTranslations('content.about')
  const values = [
    [BadgeCheck, 'value1'],
    [FileLock2, 'value2'],
    [Eye, 'value3'],
  ] as const
  return (
    <>
      <section className="bg-navy text-navy-foreground">
        <Container className="max-w-4xl py-16">
          <h1 className="font-display text-4xl font-bold leading-tight text-white">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-white/75">{t('body')}</p>
        </Container>
      </section>
      <Container className="max-w-4xl space-y-10 py-12">
        <section>
          <h2 className="text-2xl font-bold text-primary dark:text-gold">{t('missionTitle')}</h2>
          <p className="mt-3 text-lg leading-relaxed">{t('mission')}</p>
        </section>
        <section>
          <h2 className="mb-5 text-2xl font-bold text-primary dark:text-gold">{t('valuesTitle')}</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {values.map(([Icon, k]) => (
              <div key={k} className="rounded-2xl border bg-card p-6 shadow-soft">
                <Icon className="size-7 text-gold" aria-hidden />
                <h3 className="mt-3 font-bold">{t(`${k}Title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(k)}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t('notAFirm')}</p>
      </Container>
    </>
  )
}
