import { Briefcase, Check, User } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Notice } from '@/components/shared/notices'
import { RegisterForm } from '@/features/auth/components/register-form'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ firm?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: toLocale(locale), namespace: 'auth.register' })
  return { title: t('lawyerTitle') }
}

export default async function LawyerRegisterPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const { firm } = await searchParams
  const t = await getTranslations('auth.register')
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 text-sm font-semibold">
        <Link href="/register" className="flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground hover:text-foreground">
          <User className="size-4" aria-hidden /> {t('asClient')}
        </Link>
        <span className="flex items-center justify-center gap-2 rounded-lg bg-card py-2 shadow-sm">
          <Briefcase className="size-4" aria-hidden /> {t('asLawyer')}
        </span>
      </div>
      <h1 className="text-2xl font-bold">{t('lawyerTitle')}</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('lawyerSubtitle')}</p>
      <ul className="mb-6 space-y-1.5 text-sm">
        {[t('lawyerBenefits1'), t('lawyerBenefits2'), t('lawyerBenefits3')].map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> {b}
          </li>
        ))}
      </ul>
      {firm ? <Notice tone="gold" className="mb-6" title={t('firmNote')} /> : null}
      <RegisterForm accountType="lawyer" />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-gold hover:underline">
          {t('login')}
        </Link>
      </p>
    </>
  )
}
