import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/content/components/legal-page'
import { toLocale } from '@/i18n/routing'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.legal' })
  return { title: t('privacyTitle') }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale))
  return <LegalPage slug="privacy" titleKey="privacyTitle" bodyKey="privacyBody" />
}
