import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { ResetPasswordForm } from '@/features/auth/components/password-forms'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { getUserContext } from '@/lib/auth'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'auth.reset' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const t = await getTranslations('auth.reset')
  const tf = await getTranslations('auth.forgot')
  const ctx = await getUserContext()
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      {ctx ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <Notice tone="warning" title={t('invalidLink')} />
          <Button asChild variant="outline">
            <Link href="/forgot-password">{tf('title')}</Link>
          </Button>
        </div>
      )}
    </>
  )
}
