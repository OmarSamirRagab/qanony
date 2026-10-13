'use client'
import { Languages, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useSearchParams } from 'next/navigation'
import { useSyncExternalStore, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay'
import { usePathname, useRouter } from '@/i18n/navigation'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function LocaleSwitcher({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const t = useTranslations('common')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const search = useSearchParams()
  const [pending, start] = useTransition()
  const next = locale === 'ar' ? 'en' : 'ar'
  return (
    <Button
      variant={onDark ? 'onDark' : 'ghost'}
      size="sm"
      className={cn('gap-1.5', className)}
      disabled={pending}
      onClick={() =>
        start(() => {
          const qs = search.toString()
          router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: next })
        })
      }
      lang={next}
    >
      <Languages aria-hidden /> {t('switchLanguage')}
    </Button>
  )
}

const noopSubscribe = () => () => {}

export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const t = useTranslations('common')
  const { theme, setTheme } = useTheme()
  // false during SSR/hydration, true on the client — avoids a theme-icon mismatch.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const Icon = !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={onDark ? 'onDark' : 'ghost'} size="icon-sm" aria-label={t('theme')}>
          <Icon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36">
        <DropdownMenuItem onSelect={() => setTheme('light')}>
          <Sun /> {t('themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}>
          <Moon /> {t('themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>
          <Monitor /> {t('themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SignOutItem() {
  const t = useTranslations('nav.account')
  const router = useRouter()
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={async () => {
        await getBrowserClient().auth.signOut()
        router.replace('/')
        router.refresh()
      }}
    >
      <LogOut /> {t('signOut')}
    </DropdownMenuItem>
  )
}
