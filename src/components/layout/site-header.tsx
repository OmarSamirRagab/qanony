import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { Container } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher, ThemeToggle } from './controls'
import { HeaderAccount } from './header-account'
import { Logo } from './logo'
import { MobileNav } from './mobile-nav'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  const items = [
    { href: '/lawyers', label: t('public.lawyers') },
    { href: '/firms', label: t('public.firms') },
    { href: '/services', label: t('public.services') },
    { href: '/categories', label: t('public.categories') },
    { href: '/articles', label: t('public.articles') },
    { href: '/assistant', label: t('public.assistant') },
    { href: '/pricing', label: t('public.pricing') },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 text-navy-foreground backdrop-blur supports-[backdrop-filter]:bg-navy/85">
      <Container className="flex h-16 items-center gap-3">
        <MobileNav
          items={items}
          footer={
            <div className="flex flex-col gap-2">
              <Suspense>
                <LocaleSwitcher onDark />
              </Suspense>
              <Button asChild variant="gold">
                <Link href="/dashboard">{t('public.dashboard')}</Link>
              </Button>
            </div>
          }
        />
        <Logo onDark />
        <nav className="ms-6 hidden items-center gap-0.5 lg:flex" aria-label="main">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-2.5 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <Suspense>
            <LocaleSwitcher onDark className="hidden sm:inline-flex" />
          </Suspense>
          <ThemeToggle onDark />
          <HeaderAccount />
        </div>
      </Container>
    </header>
  )
}
