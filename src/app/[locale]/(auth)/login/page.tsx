import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LoginForm } from '@/features/auth/components/login-form'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'auth.login' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const { next, error } = await searchParams
  const t = await getTranslations('auth.login')
  return (
    <>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>
      <LoginForm next={next} inactive={error === 'inactive'} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-gold hover:underline">
          {t('register')}
        </Link>
      </p>
    </>
  )
}
