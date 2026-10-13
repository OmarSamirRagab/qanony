import { BadgeCheck, CreditCard, FileLock2 } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { LocaleSwitcher, ThemeToggle } from '@/components/layout/controls'
import { Logo } from '@/components/layout/logo'
import { NotConfiguredNotice } from '@/components/shared/notices'
import { toLocale } from '@/i18n/routing'
import { isSupabaseConfigured } from '@/lib/env'

export default async function AuthLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  const t = await getTranslations('auth.panel')
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="relative hidden overflow-hidden bg-navy text-navy-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-pattern absolute inset-0" aria-hidden />
        <div className="relative">
          <Logo onDark />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-tight font-bold text-white">{t('title')}</h2>
          <p className="mt-4 text-white/70">{t('body')}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [BadgeCheck, t('point1')],
              [CreditCard, t('point2')],
              [FileLock2, t('point3')],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof BadgeCheck
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <I className="size-4" aria-hidden />
                  </span>
                  {text as string}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="relative text-xs text-white/40">© {new Date().getFullYear()}</div>
      </aside>
      <main id="main" className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex items-center gap-1">
            <Suspense>
              <LocaleSwitcher />
            </Suspense>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md animate-rise">
            {!isSupabaseConfigured ? <NotConfiguredNotice className="mb-6" /> : null}
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
