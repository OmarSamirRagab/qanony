import { AlertTriangle, CalendarClock, FolderKanban, FolderCheck, Receipt, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatCard } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { getFirmContext } from '@/features/firms/context'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { addDaysIso, cairoDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

interface FirmReport {
  active_matters: number
  closed_matters: number
  overdue_tasks: number
  workload: { user_id: string; name: string; open_tasks: number; matters: number }[]
  outstanding_invoices_minor: number | null
  balance_minor: number | null
  upcoming_appointments: number
}

export default async function FirmOverview() {
  const { firm, can } = await getFirmContext()
  const t = await getTranslations('firm.overview')
  const locale = await getLocale()
  const supabase = await createClient()
  const today = cairoDate()
  const from = addDaysIso(today, -30)
  const [{ data }, { data: f }, { data: ent }] = await Promise.all([
    supabase.rpc('firm_report', { p_firm_id: firm.firm_id, p_from: from, p_to: today }),
    supabase.from('law_firms').select('verification_status').eq('id', firm.firm_id).single(),
    supabase.rpc('my_entitlements', { p_firm_id: firm.firm_id }),
  ])
  const r = (data ?? {}) as unknown as FirmReport
  const hasPlan = Boolean((ent as { plan?: unknown } | null)?.plan)
  return (
    <>
      <PageHeader title={pick(locale, firm.name, firm.name_en)} description={t('subtitle')} />
      {!hasPlan ? (
        <Notice tone="warning" className="mb-4" title={t('noSubscription')}>
          {can('firm.settings') ? (
            <Button asChild variant="gold" size="sm" className="mt-2">
              <Link href="/firm/subscription">{t('subscribeCta')}</Link>
            </Button>
          ) : null}
        </Notice>
      ) : null}
      {f?.verification_status !== 'verified' ? <Notice tone="info" className="mb-6" title={t('unverified')} /> : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={t('activeMatters')} value={r.active_matters ?? 0} icon={FolderKanban} tone="gold" href="/firm/matters" />
        <StatCard label={t('closedMatters')} value={r.closed_matters ?? 0} icon={FolderCheck} />
        <StatCard label={t('overdueTasks')} value={r.overdue_tasks ?? 0} icon={AlertTriangle} tone="warning" href="/firm/tasks" />
        <StatCard label={t('upcoming')} value={r.upcoming_appointments ?? 0} icon={CalendarClock} tone="info" href="/firm/calendar" />
        {r.outstanding_invoices_minor != null ? <StatCard label={t('outstanding')} value={formatMoney(r.outstanding_invoices_minor, locale)} icon={Receipt} href="/firm/billing" /> : null}
        {r.balance_minor != null ? <StatCard label={t('balance')} value={formatMoney(r.balance_minor, locale)} icon={Wallet} tone="success" href="/firm/finance" /> : null}
      </div>
      <Section title={t('workload')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-start font-semibold" />
                <th className="py-2 text-end font-semibold">{t('matters')}</th>
                <th className="py-2 text-end font-semibold">{t('openTasks')}</th>
              </tr>
            </thead>
            <tbody>
              {(r.workload ?? []).map((w) => (
                <tr key={w.user_id} className="border-b last:border-0">
                  <td className="py-2 font-semibold">{w.name}</td>
                  <td className="py-2 text-end tabular-nums">{w.matters}</td>
                  <td className="py-2 text-end tabular-nums">{w.open_tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}
