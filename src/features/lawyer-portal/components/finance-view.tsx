import { HandCoins, Hourglass, Landmark, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatCard, StatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { PayoutForm, SettlementAccountForm } from './finance-forms'

/** Earnings from the double-entry ledger. Lawyer (own) or firm scope. */
export async function FinanceView({ userId, firmId, canPayout = true }: { userId: string; firmId?: string; canPayout?: boolean }) {
  const t = await getTranslations('payments')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const ledgerQ = supabase.from('financial_ledger_entries').select('id, entry_type, debit_minor, credit_minor, memo, created_at').eq('account', 'beneficiary_payable')
  const payQ = supabase.from('payments').select('id, reference, payable_type, amount_minor, commission_minor, gateway_fee_minor, net_minor, refunded_minor, status, paid_at').in('status', ['succeeded', 'partially_refunded', 'refunded'])
  const [ledger, payments, settlements, payouts, accounts] = await Promise.all([
    (firmId ? ledgerQ.eq('beneficiary_firm_id', firmId) : ledgerQ.eq('beneficiary_lawyer_id', userId)).order('created_at', { ascending: false }).limit(500),
    (firmId ? payQ.eq('beneficiary_firm_id', firmId) : payQ.eq('beneficiary_lawyer_id', userId)).order('paid_at', { ascending: false }).limit(50),
    (firmId ? supabase.from('settlements').select('*').eq('beneficiary_firm_id', firmId) : supabase.from('settlements').select('*').eq('beneficiary_lawyer_id', userId)).order('created_at', { ascending: false }).limit(20),
    (firmId ? supabase.from('payout_requests').select('*').eq('firm_id', firmId) : supabase.from('payout_requests').select('*').eq('lawyer_id', userId)).order('created_at', { ascending: false }).limit(20),
    (firmId ? supabase.from('settlement_accounts').select('id, method, account_holder_name, bank_name, account_last4').eq('firm_id', firmId) : supabase.from('settlement_accounts').select('id, method, account_holder_name, bank_name, account_last4').eq('lawyer_id', userId)),
  ])
  const entries = ledger.data ?? []
  const balance = entries.reduce((s, e) => s + e.credit_minor - e.debit_minor, 0)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const month = (payments.data ?? []).filter((p) => p.paid_at && new Date(p.paid_at) >= monthStart).reduce((s, p) => s + (p.net_minor ?? 0), 0)
  const pendingPayouts = (payouts.data ?? []).filter((p) => ['requested', 'approved'].includes(p.status)).reduce((s, p) => s + p.amount_minor, 0)
  return (
    <>
      <PageHeader title={t('finance.title')} description={t('finance.subtitle')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('finance.balance')} value={formatMoney(balance, locale)} hint={t('finance.balanceHint')} icon={Wallet} tone="gold" />
        <StatCard label={t('finance.monthRevenue')} value={formatMoney(month, locale)} icon={HandCoins} tone="success" />
        <StatCard label={t('finance.pendingPayouts')} value={formatMoney(pendingPayouts, locale)} icon={Hourglass} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Section title={t('finance.transactions')}>
            {payments.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-start font-semibold">{t('list.reference')}</th>
                      <th className="py-2 text-end font-semibold">{t('finance.gross')}</th>
                      <th className="py-2 text-end font-semibold">{t('finance.commission')}</th>
                      <th className="py-2 text-end font-semibold">{t('finance.net')}</th>
                      <th className="py-2 text-end font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2">
                          <div className="font-mono text-xs">{p.reference}</div>
                          <div className="text-xs text-muted-foreground">
                            {te(`payable.${p.payable_type}`)} · {formatDate(p.paid_at, locale)}
                          </div>
                        </td>
                        <td className="py-2 text-end tabular-nums">{formatMoney(p.amount_minor, locale)}</td>
                        <td className="py-2 text-end tabular-nums text-muted-foreground">−{formatMoney(p.commission_minor ?? 0, locale)}</td>
                        <td className="py-2 text-end font-semibold tabular-nums">{formatMoney(p.net_minor ?? 0, locale)}</td>
                        <td className="py-2 text-end">
                          <StatusBadge status={p.status} label={te(`payment.${p.status}`)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={HandCoins} title={t('finance.noTransactions')} className="border-0" />
            )}
          </Section>
          <Section title={t('finance.ledger')}>
            {entries.length ? (
              <ul className="divide-y text-sm">
                {entries.slice(0, 50).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <Badge variant="outline" className="me-2">
                        {e.entry_type}
                      </Badge>
                      <span className="text-muted-foreground">{e.memo}</span>
                    </span>
                    <span className={e.credit_minor ? 'font-semibold text-success tabular-nums' : 'font-semibold text-destructive tabular-nums'}>
                      {e.credit_minor ? '+' : '−'}
                      {formatMoney(e.credit_minor || e.debit_minor, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('finance.noTransactions')}</p>
            )}
          </Section>
        </div>
        <aside className="space-y-6">
          {canPayout ? (
            <Section title={t('finance.requestPayout')}>
              <PayoutForm firmId={firmId} disabled={!accounts.data?.length || balance <= 0} />
              <p className="mt-3 text-xs text-muted-foreground">{t('finance.legalNote')}</p>
            </Section>
          ) : null}
          <Section title={t('finance.settlementAccount')}>
            {accounts.data?.length ? (
              <ul className="mb-4 space-y-2 text-sm">
                {accounts.data.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <Landmark className="size-4 text-gold" aria-hidden /> {te(`settlementMethod.${a.method as 'instapay'}`)} · {a.account_holder_name} · <span className="ltr-nums">••{a.account_last4}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {canPayout ? <SettlementAccountForm firmId={firmId} /> : null}
          </Section>
          <Section title={t('finance.payouts')}>
            {payouts.data?.length ? (
              <ul className="space-y-2 text-sm">
                {payouts.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="tabular-nums">{formatMoney(p.amount_minor, locale)}</span>
                    <StatusBadge status={p.status} label={te(`payout.${p.status as 'requested'}`)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Section>
          <Section title={t('finance.settlements')}>
            {settlements.data?.length ? (
              <ul className="space-y-2 text-sm">
                {settlements.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatDate(s.period_start, locale)} – {formatDate(s.period_end, locale)}
                    </span>
                    <span className="tabular-nums">{formatMoney(s.net_minor, locale)}</span>
                    <StatusBadge status={s.status} label={te(`settlement.${s.status}`)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Section>
        </aside>
      </div>
    </>
  )
}
