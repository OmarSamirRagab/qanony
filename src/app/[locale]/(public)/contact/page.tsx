import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, PageHeader } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { ContactForm } from '@/features/content/components/contact-form'
import { toLocale } from '@/i18n/routing'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.contact' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale))
  const t = await getTranslations('content.contact')
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Notice tone="info" className="mb-6" title={t('supportHours')}>
        {t('loggedInHint')}
      </Notice>
      <ContactForm />
    </Container>
  )
}
