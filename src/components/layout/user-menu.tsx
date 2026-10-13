'use client'
import { Briefcase, Building2, LayoutDashboard, Settings, ShieldCheck, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/primitives'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay'
import { Link } from '@/i18n/navigation'
import type { Portal } from '@/lib/domain/permissions'
import { SignOutItem } from './controls'

const PORTAL_ICON = { client: User, lawyer: Briefcase, firm: Building2, admin: ShieldCheck } as const

export function UserMenu({ name, email, portals, settingsHref }: { name: string; email: string | null; portals: Portal[]; settingsHref: string }) {
  const t = useTranslations('nav')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('account.myAccount')}>
        <Avatar name={name} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="text-foreground">
          <div className="truncate text-sm font-bold">{name}</div>
          {email ? <div className="truncate text-xs font-normal text-muted-foreground ltr-nums">{email}</div> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portals.map((p) => {
          const Icon = PORTAL_ICON[p]
          return (
            <DropdownMenuItem key={p} asChild>
              <Link href={`/${p}`}>
                <Icon /> {t(`portal.${p}`)}
              </Link>
            </DropdownMenuItem>
          )
        })}
        {portals.length === 0 ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <LayoutDashboard /> {t('public.dashboard')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings /> {t('account.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
