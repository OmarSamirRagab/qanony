import { CreditCard, Receipt } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function ClientPaymentsPage() {
  const ctx = await requirePortal('client')
  const t = await getTranslations('payments')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: payments }, { data: invoices }] = await Promise.all([
    supabase.from('payments').select('id, reference, payable_type, amount_minor, refunded_minor, status, provider, created_at, paid_at').eq('payer_id', ctx.userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('invoices').select('id, number, status, total_minor, issued_at, due_date, payment_id').eq('bill_to_user_id', ctx.userId).neq('status', 'draft').order('created_at', { ascending: false }).limit(100),
  ])
  return (
    <>
      <PageHeader title={t('list.title')} description={t('list.subtitle')} />
      <div className="space-y-6">
        <Section title={t('list.payments')}>
          {payments?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-start font-semibold">{t('list.reference')}</th>
                    <th className="py-2 text-start font-semibold">{t('list.for')}</th>
                    <th className="py-2 text-start font-semibold">{t('invoice.issuedAt')}</th>
                    <th className="py-2 text-start font-semibold">{t('checkout.amount')}</th>
                    <th className="py-2 text-start font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-3 font-mono text-xs">
                        {p.reference}
                        {p.provider === 'sandbox' ? <Badge variant="warning" className="ms-2">{t('list.sandbox')}</Badge> : null}
                      </td>
                      <td className="py-3">{te(`payable.${p.payable_type}`)}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(p.paid_at ?? p.created_at, locale)}</td>
                      <td className="py-3 tabular-nums">
                        {formatMoney(p.amount_minor, locale)}
                        {p.refunded_minor > 0 ? <div className="text-xs text-muted-foreground">{t('list.refunded', { amount: formatMoney(p.refunded_minor, locale) })}</div> : null}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={p.status} label={te(`payment.${p.status}`)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CreditCard} title={t('list.empty')} className="border-0" />
          )}
        </Section>
        <Section title={t('list.invoices')}>
          {invoices?.length ? (
            <ul className="divide-y">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/invoices/${inv.id}`} className="font-mono font-semibold hover:text-gold">
                    {inv.number}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(inv.issued_at, locale)}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(inv.total_minor, locale)}</span>
                  <StatusBadge status={inv.status} label={t(`invoice.status.${inv.status as 'paid'}`)} />
                  {inv.status === 'issued' ? (
                    <Link href={`/checkout/invoice/${inv.id}`} className="text-sm font-semibold text-gold">
                      {t('list.payInvoice')}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Receipt} title={t('list.noInvoices')} className="border-0" />
          )}
        </Section>
      </div>
    </>
  )
}
