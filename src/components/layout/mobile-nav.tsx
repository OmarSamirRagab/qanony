'use client'
import { Menu, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/overlay'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'

export interface NavItem {
  href: string
  label: string
}

export function MobileNav({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="onDark" size="icon-sm" className="lg:hidden" aria-label={t('openMenu')}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent title={t('openMenu')}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <Logo onDark />
          <SheetClose className="cursor-pointer rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent" aria-label={t('closeMenu')}>
            <X className="size-5" />
          </SheetClose>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent',
                pathname === item.href && 'bg-sidebar-accent text-gold',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {footer ? <div className="mt-auto border-t border-white/10 p-4">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  )
}
