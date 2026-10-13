import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import type { UserContext } from '@/lib/auth'
import { portalsFor, type Portal } from '@/lib/domain/permissions'
import { LocaleSwitcher, ThemeToggle } from './controls'
import { DashboardMobileNav, PortalSwitcher } from './dashboard-client'
import { Logo } from './logo'
import { NotificationBell } from './notification-bell'
import { PortalNav } from './portal-nav'
import { UserMenu } from './user-menu'

export async function DashboardShell({
  portal,
  ctx,
  permissions,
  headerExtra,
  children,
}: {
  portal: Portal
  ctx: UserContext
  permissions?: string[]
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const t = await getTranslations('nav')
  const portals = portalsFor(ctx.roles, ctx.firms.length)
  const settingsHref = portals.includes('lawyer') ? '/lawyer/settings' : '/client/settings'
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Logo onDark />
        </div>
        <div className="px-4 pt-4">
          <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-gold">{t(`portal.${portal}`)}</div>
        </div>
        <Suspense>
          <PortalNav portal={portal} permissions={permissions} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
          <Suspense>
            <DashboardMobileNav portal={portal} permissions={permissions} title={t(`portal.${portal}`)} />
          </Suspense>
          <div className="min-w-0 flex-1">{headerExtra}</div>
          {portals.length > 1 ? <PortalSwitcher current={portal} portals={portals} /> : null}
          <Suspense>
            <LocaleSwitcher className="hidden sm:inline-flex" />
          </Suspense>
          <ThemeToggle />
          <NotificationBell userId={ctx.userId} onDark={false} />
          <UserMenu name={ctx.fullName} email={ctx.email} portals={portals} settingsHref={settingsHref} />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
