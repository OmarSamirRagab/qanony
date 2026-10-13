import { BarChart3, Lock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatCard } from '@/components/shared'
import { DateRangeFilter, parseRange } from '@/components/shared/date-range'
import { BarsChart, TrendChart } from '@/components/charts/charts'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { hasFeature, type Entitlements } from '@/lib/domain/entitlements'
import { createClient } from '@/lib/supabase/server'

interface LawyerReport {
  bookings_by_day: { day: string; count: number }[]
  revenue_by_type: { type: string; net_minor: number }[]
  status_breakdown: Record<string, number>
  types: Record<string, number>
  ratings: Record<string, number>
  services: { title: string; orders: number; net_minor: number }[]
}

export default async function LawyerAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePortal('lawyer')
  const t = await getTranslations('dashboard.analytics')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: ent } = await supabase.rpc('my_entitlements', {})
  if (!hasFeature(ent as unknown as Entitlements, 'analytics')) {
    return (
      <>
        <PageHeader title={t('title')} />
        <EmptyState
          icon={Lock}
          title={t('upgrade')}
          action={
            <Button asChild variant="gold">
              <Link href="/lawyer/subscription">{t('upgradeCta')}</Link>
            </Button>
          }
        />
      </>
    )
  }
  const range = parseRange(await searchParams, 90)
  const { data } = await supabase.rpc('lawyer_report', { p_from: range.from, p_to: range.to })
  const r = (data ?? {}) as unknown as LawyerReport
  const dayFmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const statuses = r.status_breakdown ?? {}
  const total = Object.values(statuses).reduce((a, b) => a + b, 0)
  const completed = statuses.COMPLETED ?? 0
  const cancelled = (statuses.CANCELLED ?? 0) + (statuses.REFUNDED ?? 0)
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '—')
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <DateRangeFilter basePath="/lawyer/analytics" from={range.from} to={range.to} csvHref={`/api/reports/lawyer?from=${range.from}&to=${range.to}`} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={te('appointment.COMPLETED')} value={completed} icon={BarChart3} tone="gold" />
        <StatCard label={t('completionRate')} value={pct(completed)} tone="success" />
        <StatCard label={t('cancellationRate')} value={pct(cancelled)} tone="warning" />
        <StatCard label={t('orders')} value={(r.services ?? []).reduce((a, s) => a + s.orders, 0)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('bookings')}>
          <TrendChart data={(r.bookings_by_day ?? []).map((d) => ({ label: dayFmt.format(new Date(`${d.day}T00:00:00Z`)), value: d.count }))} tableCaption={tc('viewDetails')} />
        </Section>
        <Section title={t('revenueByType')}>
          <BarsChart
            unit="money"
            data={(r.revenue_by_type ?? []).map((x) => ({ label: x.type === 'service' ? te('payable.service_order') : te(`consultation.${x.type as 'video'}`), value: x.net_minor }))}
            tableCaption={tc('viewDetails')}
          />
        </Section>
        <Section title={t('types')}>
          <BarsChart data={Object.entries(r.types ?? {}).map(([k, v]) => ({ label: te(`consultation.${k as 'video'}`), value: v }))} tableCaption={tc('viewDetails')} />
        </Section>
        <Section title={t('ratings')}>
          <BarsChart data={[5, 4, 3, 2, 1].map((s) => ({ label: '★'.repeat(s), value: r.ratings?.[String(s)] ?? 0 }))} tableCaption={tc('viewDetails')} />
        </Section>
      </div>
      {r.services?.length ? (
        <Section title={t('services')} className="mt-6">
          <BarsChart unit="money" data={r.services.map((s) => ({ label: s.title.slice(0, 30), value: s.net_minor }))} tableCaption={tc('viewDetails')} />
        </Section>
      ) : null}
    </>
  )
}
