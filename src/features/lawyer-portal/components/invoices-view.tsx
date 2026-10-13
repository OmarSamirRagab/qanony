import { Receipt } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { InvoiceDialog, InvoiceStatusActions } from './invoice-dialog'

/** Invoice management for a lawyer's own practice or a firm. Platform receipts are read-only. */
export async function InvoicesView({ userId, firmId, canManage = true }: { userId: string; firmId?: string; canManage?: boolean }) {
  const t = await getTranslations('dashboard.invoices')
  const tp = await getTranslations('payments.invoice')
  const locale = await getLocale()
  const supabase = await createClient()
  const invQ = supabase.from('invoices').select('id, number, status, bill_to_name, total_minor, issued_at, due_date, payment_id, created_at')
  const [{ data: invoices }, { data: clients }, { data: matters }] = await Promise.all([
    (firmId ? invQ.eq('issuer_firm_id', firmId) : invQ.eq('issuer_lawyer_id', userId)).order('created_at', { ascending: false }).limit(200),
    (firmId ? supabase.from('practice_clients').select('id, full_name').eq('firm_id', firmId) : supabase.from('practice_clients').select('id, full_name').eq('owner_lawyer_id', userId)).order('full_name').limit(500),
    (firmId ? supabase.from('legal_matters').select('id, reference, title').eq('firm_id', firmId) : supabase.from('legal_matters').select('id, reference, title').eq('owner_lawyer_id', userId).is('firm_id', null)).limit(500),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={canManage ? <InvoiceDialog firmId={firmId} clients={(clients ?? []).map((c) => ({ id: c.id, label: c.full_name }))} matters={(matters ?? []).map((m) => ({ id: m.id, label: `${m.reference} — ${m.title}` }))} /> : null}
      />
      {invoices?.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{tp('number')}</th>
                <th className="px-4 py-3 text-start font-semibold">{tp('billTo')}</th>
                <th className="px-4 py-3 text-start font-semibold">{tp('issuedAt')}</th>
                <th className="px-4 py-3 text-start font-semibold">{tp('total')}</th>
                <th className="px-4 py-3 text-start font-semibold" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/invoices/${i.id}`} className="hover:text-gold">
                      {i.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{i.bill_to_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(i.issued_at ?? i.created_at, locale)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(i.total_minor, locale)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={i.status} label={tp(`status.${i.status as 'paid'}`)} />
                  </td>
                  <td className="px-4 py-3">{canManage && !i.payment_id ? <InvoiceStatusActions id={i.id} status={i.status} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Receipt} title={t('empty')} />
      )}
    </>
  )
}
