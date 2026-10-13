import { getTranslations } from 'next-intl/server'
import { BarsChart } from '@/components/charts/charts'
import { PageHeader, Section } from '@/components/shared'
import { DateRangeFilter, parseRange } from '@/components/shared/date-range'
import { Notice } from '@/components/shared/notices'
import { getFirmContext } from '@/features/firms/context'
import { createClient } from '@/lib/supabase/server'

export default async function FirmReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { firm, can } = await getFirmContext()
  const range = parseRange(await searchParams, 90)
  const t = await getTranslations('firm.reports')
  const tc = await getTranslations('common')
  const supabase = await createClient()
  const { data } = await supabase.rpc('firm_report', { p_firm_id: firm.firm_id, p_from: range.from, p_to: range.to })
  const r = (data ?? {}) as unknown as {
    revenue_by_lawyer: { lawyer: string; gross_minor: number; net_minor: number }[] | null
    revenue_by_branch: { branch: string; net_minor: number }[] | null
    workload: { name: string; open_tasks: number; matters: number }[]
  }
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <DateRangeFilter basePath="/firm/reports" from={range.from} to={range.to} csvHref={`/api/reports/firm?firm=${firm.firm_id}&from=${range.from}&to=${range.to}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        {can('reports.financial') ? (
          <>
            <Section title={t('revenueByLawyer')}>
              <BarsChart unit="money" data={(r.revenue_by_lawyer ?? []).map((x) => ({ label: x.lawyer, value: x.net_minor }))} tableCaption={tc('viewDetails')} />
            </Section>
            <Section title={t('revenueByBranch')}>
              <BarsChart unit="money" data={(r.revenue_by_branch ?? []).map((x) => ({ label: x.branch, value: x.net_minor }))} tableCaption={tc('viewDetails')} />
            </Section>
          </>
        ) : (
          <Notice tone="info" title={t('noFinancialAccess')} className="lg:col-span-2" />
        )}
        <Section title={t('workload')} className="lg:col-span-2">
          <BarsChart data={(r.workload ?? []).map((w) => ({ label: w.name, value: w.open_tasks }))} tableCaption={tc('viewDetails')} />
        </Section>
      </div>
    </>
  )
}
