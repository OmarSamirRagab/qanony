import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ForgotPasswordForm } from '@/features/auth/components/password-forms'
import { toLocale } from '@/i18n/routing'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'auth.forgot' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const t = await getTranslations('auth.forgot')
  return (
    <>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>
      <ForgotPasswordForm />
    </>
  )
}
