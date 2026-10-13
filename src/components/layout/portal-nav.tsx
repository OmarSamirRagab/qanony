'use client'
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  CreditCard,
  FileCheck2,
  FileStack,
  FileText,
  FolderKanban,
  Gauge,
  Gavel,
  Heart,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessagesSquare,
  Percent,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tags,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Link, usePathname } from '@/i18n/navigation'
import type { Portal } from '@/lib/domain/permissions'
import { cn } from '@/lib/utils'

interface Item {
  href: string
  key: string
  icon: LucideIcon
  /** Only shown when this firm permission / platform permission is held. */
  perm?: string
}
interface Group {
  key: string
  items: Item[]
}

const NAV: Record<Portal, Group[]> = {
  client: [
    {
      key: 'work',
      items: [
        { href: '/client', key: 'overview', icon: LayoutDashboard },
        { href: '/client/appointments', key: 'appointments', icon: CalendarClock },
        { href: '/client/messages', key: 'messages', icon: MessagesSquare },
        { href: '/client/matters', key: 'matters', icon: FolderKanban },
        { href: '/client/orders', key: 'orders', icon: ShoppingBag },
        { href: '/client/documents', key: 'documents', icon: FileStack },
      ],
    },
    {
      key: 'account',
      items: [
        { href: '/client/payments', key: 'payments', icon: CreditCard },
        { href: '/client/favorites', key: 'favorites', icon: Heart },
        { href: '/client/reviews', key: 'reviews', icon: Star },
        { href: '/client/support', key: 'support', icon: LifeBuoy },
        { href: '/client/settings', key: 'settings', icon: Settings },
      ],
    },
  ],
  lawyer: [
    {
      key: 'work',
      items: [
        { href: '/lawyer', key: 'overview', icon: LayoutDashboard },
        { href: '/lawyer/appointments', key: 'appointments', icon: CalendarClock },
        { href: '/lawyer/availability', key: 'availability', icon: Clock },
        { href: '/lawyer/messages', key: 'messages', icon: MessagesSquare },
      ],
    },
    {
      key: 'practice',
      items: [
        { href: '/lawyer/clients', key: 'clients', icon: Users },
        { href: '/lawyer/matters', key: 'matters', icon: FolderKanban },
        { href: '/lawyer/documents', key: 'documents', icon: FileStack },
        { href: '/lawyer/templates', key: 'templates', icon: FileText },
        { href: '/lawyer/services', key: 'services', icon: Tags },
        { href: '/lawyer/orders', key: 'orders', icon: ShoppingBag },
        { href: '/lawyer/ai', key: 'ai', icon: Bot },
      ],
    },
    {
      key: 'money',
      items: [
        { href: '/lawyer/finance', key: 'finance', icon: Wallet },
        { href: '/lawyer/invoices', key: 'invoices', icon: Receipt },
        { href: '/lawyer/analytics', key: 'analytics', icon: BarChart3 },
        { href: '/lawyer/reviews', key: 'reviews', icon: Star },
      ],
    },
    {
      key: 'account',
      items: [
        { href: '/lawyer/profile', key: 'profile', icon: UserCircle },
        { href: '/lawyer/verification', key: 'verification', icon: ShieldCheck },
        { href: '/lawyer/subscription', key: 'subscription', icon: Gauge },
        { href: '/lawyer/settings', key: 'settings', icon: Settings },
      ],
    },
  ],
  firm: [
    {
      key: 'work',
      items: [
        { href: '/firm', key: 'overview', icon: LayoutDashboard },
        { href: '/firm/calendar', key: 'calendar', icon: CalendarDays, perm: 'appointments.manage' },
        { href: '/firm/matters', key: 'matters', icon: FolderKanban, perm: 'matters.view' },
        { href: '/firm/tasks', key: 'tasks', icon: ListChecks },
        { href: '/firm/clients', key: 'clients', icon: Users, perm: 'clients.manage' },
        { href: '/firm/documents', key: 'documents', icon: FileStack, perm: 'documents.view' },
      ],
    },
    {
      key: 'money',
      items: [
        { href: '/firm/billing', key: 'billing', icon: Receipt, perm: 'invoices.view' },
        { href: '/firm/finance', key: 'finance', icon: Wallet, perm: 'reports.financial' },
        { href: '/firm/reports', key: 'reports', icon: BarChart3 },
      ],
    },
    {
      key: 'account',
      items: [
        { href: '/firm/team', key: 'team', icon: Users, perm: 'members.manage' },
        { href: '/firm/roles', key: 'roles', icon: KeyRound, perm: 'members.manage' },
        { href: '/firm/branches', key: 'branches', icon: Building2, perm: 'firm.settings' },
        { href: '/firm/profile', key: 'profile', icon: Briefcase, perm: 'firm.settings' },
        { href: '/firm/subscription', key: 'subscription', icon: Gauge, perm: 'firm.settings' },
      ],
    },
  ],
  admin: [
    {
      key: 'operations',
      items: [
        { href: '/admin', key: 'overview', icon: LayoutDashboard },
        { href: '/admin/users', key: 'users', icon: Users, perm: 'users.view' },
        { href: '/admin/verification', key: 'verification', icon: ShieldCheck, perm: 'verification.review' },
        { href: '/admin/firms', key: 'firms', icon: Building2, perm: 'firms.manage' },
        { href: '/admin/appointments', key: 'appointments', icon: CalendarClock, perm: 'appointments.view' },
        { href: '/admin/disputes', key: 'disputes', icon: Gavel, perm: 'disputes.manage' },
        { href: '/admin/support', key: 'support', icon: LifeBuoy, perm: 'support.tickets' },
      ],
    },
    {
      key: 'marketplace',
      items: [
        { href: '/admin/services', key: 'services', icon: Tags, perm: 'services.moderate' },
        { href: '/admin/reviews', key: 'reviews', icon: Star, perm: 'reviews.moderate' },
        { href: '/admin/content', key: 'content', icon: BookOpen, perm: 'content.manage' },
        { href: '/admin/categories', key: 'categories', icon: Scale, perm: 'content.manage' },
      ],
    },
    {
      key: 'finance',
      items: [
        { href: '/admin/payments', key: 'payments', icon: CreditCard, perm: 'payments.view' },
        { href: '/admin/refunds', key: 'refunds', icon: HandCoins, perm: 'payments.refund' },
        { href: '/admin/settlements', key: 'settlements', icon: Wallet, perm: 'settlements.manage' },
        { href: '/admin/commissions', key: 'commissions', icon: Percent, perm: 'settings.manage' },
        { href: '/admin/subscriptions', key: 'subscriptions', icon: Gauge, perm: 'subscriptions.manage' },
      ],
    },
    {
      key: 'platform',
      items: [
        { href: '/admin/reports', key: 'reports', icon: BarChart3, perm: 'reports.view' },
        { href: '/admin/settings', key: 'settings', icon: Settings, perm: 'settings.manage' },
        { href: '/admin/integrations', key: 'integrations', icon: FileCheck2, perm: 'settings.manage' },
        { href: '/admin/audit', key: 'audit', icon: ScrollText, perm: 'audit.view' },
      ],
    },
  ],
}

export function PortalNav({ portal, permissions, onNavigate }: { portal: Portal; permissions?: string[]; onNavigate?: () => void }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const search = useSearchParams()
  const firm = search.get('firm')
  const perms = permissions ? new Set(permissions) : null
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label={t(`portal.${portal}`)}>
      {NAV[portal].map((group) => {
        const items = group.items.filter((i) => !i.perm || !perms || perms.has(i.perm))
        if (!items.length) return null
        return (
          <div key={group.key}>
            <div className="mb-1.5 px-3 text-[11px] font-bold tracking-wider text-sidebar-muted uppercase">{t(`groups.${group.key}` as 'groups.work')}</div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === `/${portal}` ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
                const Icon = item.icon
                const href = portal === 'firm' && firm ? `${item.href}?firm=${firm}` : item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-white',
                        active && 'bg-sidebar-accent text-white shadow-[inset_3px_0_0_var(--color-gold)] rtl:shadow-[inset_-3px_0_0_var(--color-gold)]',
                      )}
                    >
                      <Icon className={cn('size-4.5 shrink-0', active ? 'text-gold' : 'text-sidebar-muted')} aria-hidden />
                      {t(`${portal}.${item.key}` as 'client.overview')}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

export function NotificationsLink() {
  const t = useTranslations('nav.account')
  return (
    <Link href="/notifications" className="flex items-center gap-2 text-sm">
      <Bell className="size-4" aria-hidden /> {t('notifications')}
    </Link>
  )
}

