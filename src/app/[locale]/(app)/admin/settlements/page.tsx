import { Landmark, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { markSettlementPaid, rejectPayout, settlePayout } from '@/features/admin/actions'
import { QuickAction, ReasonAction } from '@/features/admin/components/reason-action'
import { SettlementForm } from '@/features/admin/components/settlement-form'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { addDaysIso, cairoDate, formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'

export default async function AdminSettlements() {
  const ctx = await adminAccess('settlements.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.settlements')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: balances }, { data: payouts }, { data: settlements }] = await Promise.all([
    supabase.rpc('admin_beneficiary_balances'),
    supabase
      .from('payout_requests')
      .select('id, amount_minor, status, created_at, lawyer:lawyer_profiles(display_name_ar), firm:law_firms(name_ar), lawyer_id, firm_id')
      .eq('status', 'requested')
      .order('created_at'),
    supabase
      .from('settlements')
      .select('id, period_start, period_end, gross_minor, commission_minor, refund_adjustments_minor, net_minor, status, reference, paid_at, lawyer:lawyer_profiles(display_name_ar), firm:law_firms(name_ar), account:settlement_accounts(method, account_holder_name, bank_name, account_last4)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const today = cairoDate()
  const beneficiaries = (balances ?? []).map((b) => ({
    key: b.lawyer_id ?? b.firm_id ?? '',
    lawyerId: b.lawyer_id,
    firmId: b.firm_id,
    label: `${b.name} — ${formatMoney(b.balance_minor - b.in_flight_minor, locale)}`,
  }))
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Notice tone="warning" className="mb-6" title={t('regulatory')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Section title={t('payoutRequests')}>
            {payouts?.length ? (
              <ul className="divide-y">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-semibold">{p.lawyer?.display_name_ar ?? p.firm?.name_ar}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatMoney(p.amount_minor, locale)} · {formatDate(p.created_at, locale)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <QuickAction label={te('payout.approved')} action={settlePayout.bind(null, p.id)} success={t('created')} variant="gold" />
                      <ReasonAction label={te('payout.rejected')} title={te('payout.rejected')} fieldLabel={tc('notes')} action={rejectPayout.bind(null, p.id)} success={tc('saved')} variant="ghost" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tc('noData')}</p>
            )}
          </Section>
          <Section title={t('title')}>
            {settlements?.length ? (
              <Table minWidth={860}>
                <THead>
                  <Th>{t('beneficiary')}</Th>
                  <Th>{tc('dateRange')}</Th>
                  <Th end>{t('balance')}</Th>
                  <Th>{t('account')}</Th>
                  <Th end>{tc('status')}</Th>
                </THead>
                <tbody>
                  {settlements.map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-semibold">{s.lawyer?.display_name_ar ?? s.firm?.name_ar}</Td>
                      <Td className="text-xs">
                        {formatDate(s.period_start, locale)} – {formatDate(s.period_end, locale)}
                      </Td>
                      <Td end className="font-semibold tabular-nums">
                        {formatMoney(s.net_minor, locale)}
                      </Td>
                      <Td className="text-xs">
                        {s.account ? (
                          <span className="inline-flex items-center gap-1">
                            <Landmark className="size-3.5 text-gold" aria-hidden />
                            {te(`settlementMethod.${s.account.method as 'instapay'}`)} · {s.account.account_holder_name} · <span dir="ltr">••{s.account.account_last4}</span>
                          </span>
                        ) : (
                          <span className="text-destructive">—</span>
                        )}
                      </Td>
                      <Td end>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge status={s.status} label={te(`settlement.${s.status}`)} />
                          {s.reference ? <span className="font-mono text-xs" dir="ltr">{s.reference}</span> : null}
                          {s.status === 'pending' || s.status === 'processing' ? (
                            <ReasonAction label={t('markPaid')} title={t('markPaid')} fieldLabel={t('transferRef')} action={markSettlementPaid.bind(null, s.id)} success={t('paid')} singleLine variant="gold" />
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={Wallet} title={tc('noData')} className="border-0" />
            )}
          </Section>
        </div>
        <aside>
          <Section title={t('create')}>
            <SettlementForm beneficiaries={beneficiaries} defaultStart={addDaysIso(today, -30)} defaultEnd={today} />
          </Section>
        </aside>
      </div>
    </>
  )
}
