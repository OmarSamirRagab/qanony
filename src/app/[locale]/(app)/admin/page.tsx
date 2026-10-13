import { AlertTriangle, BadgeCheck, Briefcase, Building2, CalendarCheck, CalendarClock, Gavel, Gauge, HandCoins, LifeBuoy, Percent, Receipt, ShieldCheck, Star, Tags, Users, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatCard } from '@/components/shared'
import { adminAccess } from '@/features/admin/guard'
import { formatMoney } from '@/lib/domain/money'
import { hasPlatformPermission } from '@/lib/domain/permissions'
import { createClient } from '@/lib/supabase/server'

interface Stats {
  clients: number
  lawyers: number
  verified_lawyers: number
  pending_verifications: number
  active_firms: number
  bookings: number
  completed_consultations: number
  gross_volume_minor: number | null
  commission_minor: number | null
  subscription_revenue_minor: number | null
  refunds_minor: number | null
  pending_refunds: number
  open_disputes: number
  open_tickets: number
  active_subscriptions: number
  pending_services: number
  reported_reviews: number
}

export default async function AdminOverview() {
  const ctx = (await adminAccess())!
  const t = await getTranslations('admin.overview')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_overview_stats')
  const s = (data ?? {}) as unknown as Stats
  const can = (p: Parameters<typeof hasPlatformPermission>[1]) => hasPlatformPermission(ctx.roles, p)
  const money = (v: number | null) => formatMoney(v ?? 0, locale)
  const actions = [
    { show: can('verification.review'), label: t('pendingVerifications'), value: s.pending_verifications, href: '/admin/verification', icon: ShieldCheck },
    { show: can('services.moderate'), label: t('pendingServices'), value: s.pending_services, href: '/admin/services', icon: Tags },
    { show: can('disputes.manage'), label: t('disputes'), value: s.open_disputes, href: '/admin/disputes', icon: Gavel },
    { show: can('support.tickets'), label: t('tickets'), value: s.open_tickets, href: '/admin/support', icon: LifeBuoy },
    { show: can('reviews.moderate'), label: t('reportedReviews'), value: s.reported_reviews, href: '/admin/reviews', icon: Star },
    { show: can('payments.refund'), label: t('pendingRefunds'), value: s.pending_refunds, href: '/admin/refunds', icon: HandCoins },
  ].filter((a) => a.show)
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Section title={t('needsAction')} className="mb-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {actions.map((a) => (
            <StatCard key={a.href} label={a.label} value={a.value ?? 0} icon={a.icon} tone={(a.value ?? 0) > 0 ? 'warning' : 'default'} href={a.href} />
          ))}
        </div>
      </Section>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('clients')} value={s.clients ?? 0} icon={Users} />
        <StatCard label={t('lawyers')} value={s.lawyers ?? 0} icon={Briefcase} />
        <StatCard label={t('verifiedLawyers')} value={s.verified_lawyers ?? 0} icon={BadgeCheck} tone="success" />
        <StatCard label={t('activeFirms')} value={s.active_firms ?? 0} icon={Building2} />
        <StatCard label={t('bookings')} value={s.bookings ?? 0} icon={CalendarClock} tone="info" />
        <StatCard label={t('completed')} value={s.completed_consultations ?? 0} icon={CalendarCheck} tone="success" />
        <StatCard label={t('subscriptions')} value={s.active_subscriptions ?? 0} icon={Gauge} />
      </div>
      {s.gross_volume_minor != null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t('gmv')} value={money(s.gross_volume_minor)} icon={Receipt} tone="gold" href="/admin/payments" />
          <StatCard label={t('commission')} value={money(s.commission_minor)} icon={Percent} tone="success" />
          <StatCard label={t('subscriptionRevenue')} value={money(s.subscription_revenue_minor)} icon={Wallet} />
          <StatCard label={t('refunds')} value={money(s.refunds_minor)} icon={AlertTriangle} href="/admin/refunds" />
        </div>
      ) : null}
    </>
  )
}
