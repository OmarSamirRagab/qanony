import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { Container, StatusBadge } from '@/components/shared'
import { Logo } from '@/components/layout/logo'
import { PrintButton } from '@/components/shared/print-button'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

/** Printable invoice / receipt, visible to the billed client and the issuer (RLS). */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const t = await getTranslations('payments.invoice')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('*, lawyer:lawyer_profiles(display_name_ar, display_name_en), firm:law_firms(name_ar, name_en)')
    .eq('id', id)
    .maybeSingle()
  if (!inv) notFound()
  const lines = (Array.isArray(inv.line_items) ? inv.line_items : []) as { description: string; quantity: number; unit_minor: number; reference?: string }[]
  const issuer = inv.firm ? pick(locale, inv.firm.name_ar, inv.firm.name_en) : inv.lawyer ? pick(locale, inv.lawyer.display_name_ar, inv.lawyer.display_name_en) : t('platform')
  return (
    <Container className="max-w-3xl py-10">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label={t('print')} />
      </div>
      <article className="rounded-2xl border bg-card p-8 shadow-soft print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <Logo />
          <div className="text-end">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <div className="font-mono text-sm">{inv.number}</div>
            <StatusBadge status={inv.status} label={t(`status.${inv.status as 'paid'}`)} className="mt-2" />
          </div>
        </header>
        <div className="grid gap-4 py-6 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">{t('issuer')}</div>
            <div className="font-semibold">{issuer}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('billTo')}</div>
            <div className="font-semibold">{inv.bill_to_name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('issuedAt')}</div>
            <div className="font-semibold">{formatDate(inv.issued_at ?? inv.created_at, locale)}</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">{t('description')}</th>
              <th className="px-3 py-2 text-center">{t('qty')}</th>
              <th className="px-3 py-2 text-end">{t('unit')}</th>
              <th className="px-3 py-2 text-end">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b">
                <td className="px-3 py-2">
                  {l.description}
                  {l.reference ? <div className="font-mono text-xs text-muted-foreground">{l.reference}</div> : null}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{l.quantity}</td>
                <td className="px-3 py-2 text-end tabular-nums">{formatMoney(l.unit_minor, locale)}</td>
                <td className="px-3 py-2 text-end tabular-nums">{formatMoney(Math.round(l.quantity * l.unit_minor), locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ms-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>{t('subtotal')}</dt>
            <dd className="tabular-nums">{formatMoney(inv.subtotal_minor, locale)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t('tax')}</dt>
            <dd className="tabular-nums">{formatMoney(inv.tax_minor, locale)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <dt>{t('total')}</dt>
            <dd className="tabular-nums">{formatMoney(inv.total_minor, locale)}</dd>
          </div>
        </dl>
        {inv.notes ? <p className="mt-6 whitespace-pre-line text-sm">{inv.notes}</p> : null}
        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">{t('note')}</p>
      </article>
    </Container>
  )
}
