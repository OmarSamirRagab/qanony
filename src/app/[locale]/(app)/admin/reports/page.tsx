import { CreditCard, Percent, Repeat, UserCheck } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { BarsChart, TrendChart } from '@/components/charts/charts'
import { PageHeader, Section, StatCard } from '@/components/shared'
import { DateRangeFilter, parseRange } from '@/components/shared/date-range'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { createClient } from '@/lib/supabase/server'

interface AdminReport {
  signups_by_day: { day: string; clients: number; lawyers: number }[]
  revenue_by_day: { day: string; gross_minor: number; commission_minor: number }[]
  booking_funnel: { created: number; paid_or_confirmed: number; completed: number; expired: number; cancelled: number }
  payment_failures: number
  payments_total: number
  refund_rate: number
  active_lawyers: number
  subscriptions_by_plan: Record<string, number>
  repeat_clients: number
  clients_with_completed: number
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await adminAccess('reports.view')
  if (!ctx) return <AccessDenied />
  const range = parseRange(await searchParams, 30)
  const t = await getTranslations('admin.reports')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_report', { p_from: range.from, p_to: range.to })
  const r = (data ?? null) as unknown as AdminReport | null
  const pct = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { style: 'percent', maximumFractionDigits: 1 }).format(v)
  const funnel = r?.booking_funnel
  return (
    <>
      <PageHeader title={t('title')} />
      <DateRangeFilter basePath="/admin/reports" from={range.from} to={range.to} csvHref={`/api/reports/admin?from=${range.from}&to=${range.to}`} />
      {r ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('activeLawyers')} value={r.active_lawyers} icon={UserCheck} tone="gold" />
            <StatCard label={t('paymentFailures')} value={`${r.payment_failures} / ${r.payments_total}`} icon={CreditCard} tone="warning" />
            <StatCard label={t('refundRate')} value={pct(Number(r.refund_rate))} icon={Percent} />
            <StatCard label={t('retention')} value={`${r.repeat_clients} / ${r.clients_with_completed}`} icon={Repeat} tone="success" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t('revenue')}>
              <TrendChart unit="money" data={r.revenue_by_day.map((d) => ({ label: d.day.slice(5), value: d.gross_minor }))} tableCaption={tc('viewDetails')} />
            </Section>
            <Section title={t('signups')}>
              <TrendChart data={r.signups_by_day.map((d) => ({ label: d.day.slice(5), value: d.clients + d.lawyers }))} tableCaption={tc('viewDetails')} />
            </Section>
            {funnel ? (
              <Section title={t('funnel')}>
                <BarsChart
                  data={[
                    { label: t('created'), value: funnel.created },
                    { label: t('paid'), value: funnel.paid_or_confirmed },
                    { label: t('completed'), value: funnel.completed },
                    { label: t('expired'), value: funnel.expired },
                    { label: t('cancelled'), value: funnel.cancelled },
                  ]}
                  tableCaption={tc('viewDetails')}
                />
              </Section>
            ) : null}
            <Section title={t('plans')}>
              <BarsChart data={Object.entries(r.subscriptions_by_plan ?? {}).map(([label, value]) => ({ label, value }))} tableCaption={tc('viewDetails')} />
            </Section>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{tc('noData')}</p>
      )}
    </>
  )
}
