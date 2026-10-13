'use client'
import { ArrowLeftRight, Menu, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/overlay'
import { Link } from '@/i18n/navigation'
import type { Portal } from '@/lib/domain/permissions'
import { Logo } from './logo'
import { PortalNav } from './portal-nav'

export function DashboardMobileNav({ portal, permissions, title }: { portal: Portal; permissions?: string[]; title: string }) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={t('openMenu')}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent title={title}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <Logo onDark />
          <SheetClose className="cursor-pointer rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent" aria-label={t('closeMenu')}>
            <X className="size-5" />
          </SheetClose>
        </div>
        <PortalNav portal={portal} permissions={permissions} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export function PortalSwitcher({ current, portals }: { current: Portal; portals: Portal[] }) {
  const t = useTranslations('nav')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden md:inline-flex">
          <ArrowLeftRight aria-hidden /> {t(`portal.${current}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('account.switchPortal')}</DropdownMenuLabel>
        {portals.map((p) => (
          <DropdownMenuItem key={p} asChild disabled={p === current}>
            <Link href={`/${p}`}>{t(`portal.${p}`)}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
