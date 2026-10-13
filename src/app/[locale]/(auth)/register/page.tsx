import { Briefcase, User } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { RegisterForm } from '@/features/auth/components/register-form'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'auth.register' })
  return { title: t('metaTitle') }
}

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const t = await getTranslations('auth.register')
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 text-sm font-semibold">
        <span className="flex items-center justify-center gap-2 rounded-lg bg-card py-2 shadow-sm">
          <User className="size-4" aria-hidden /> {t('asClient')}
        </span>
        <Link href="/register/lawyer" className="flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground hover:text-foreground">
          <Briefcase className="size-4" aria-hidden /> {t('asLawyer')}
        </Link>
      </div>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>
      <RegisterForm accountType="client" />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-gold hover:underline">
          {t('login')}
        </Link>
      </p>
    </>
  )
}
