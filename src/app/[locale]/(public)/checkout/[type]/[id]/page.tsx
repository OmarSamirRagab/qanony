import { Lock, ShieldCheck, TimerOff } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { z } from 'zod'
import { Container, EmptyState } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { PayButton } from '@/features/payments/components/pay-button'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { formatDateTime, formatTime } from '@/lib/format'
import { activeProvider } from '@/lib/providers/payments'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export const metadata: Metadata = { robots: { index: false } }

type Props = { params: Promise<{ locale: string; type: string; id: string }> }

export default async function CheckoutPage({ params }: Props) {
  const { locale: raw, type, id } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  if (!['appointment', 'service_order', 'subscription', 'invoice'].includes(type) || !z.uuid().safeParse(id).success) notFound()
  await requireUser(`/checkout/${type}/${id}`)
  const t = await getTranslations('payments.checkout')
  const te = await getTranslations('enums')
  const supabase = await createClient()

  let title = ''
  let detail = ''
  let amountMinor = 0
  let payable = false
  let holdUntil: string | null = null
  let expired = false

  if (type === 'appointment') {
    const { data } = await supabase
      .from('appointments')
      .select('status, price_minor, starts_at, hold_expires_at, consultation_type, reference, lawyer:lawyer_profiles(display_name_ar, display_name_en, timezone)')
      .eq('id', id)
      .maybeSingle()
    if (!data) notFound()
    title = `${te(`consultation.${data.consultation_type}`)} — ${data.lawyer ? pick(locale, data.lawyer.display_name_ar, data.lawyer.display_name_en) : ''}`
    detail = `${data.reference} · ${formatDateTime(data.starts_at, locale, data.lawyer?.timezone)}`
    amountMinor = data.price_minor
    payable = data.status === 'PENDING_PAYMENT' && !!data.hold_expires_at && new Date(data.hold_expires_at) > new Date()
    expired = data.status === 'EXPIRED' || (data.status === 'PENDING_PAYMENT' && !payable)
    holdUntil = data.hold_expires_at
  } else if (type === 'service_order') {
    const { data } = await supabase.from('service_orders').select('status, price_minor, reference, service:legal_services(title_ar, title_en)').eq('id', id).maybeSingle()
    if (!data) notFound()
    title = data.service ? pick(locale, data.service.title_ar, data.service.title_en) : data.reference
    detail = data.reference
    amountMinor = data.price_minor
    payable = data.status === 'PENDING_PAYMENT'
  } else if (type === 'subscription') {
    const { data } = await supabase.from('subscriptions').select('status, billing_cycle, plan:subscription_plans(name_ar, name_en, price_monthly_minor, price_yearly_minor)').eq('id', id).maybeSingle()
    if (!data || !data.plan) notFound()
    title = pick(locale, data.plan.name_ar, data.plan.name_en)
    detail = te(`billingCycle.${data.billing_cycle as 'monthly'}`)
    amountMinor = data.billing_cycle === 'yearly' ? data.plan.price_yearly_minor : data.plan.price_monthly_minor
    payable = ['incomplete', 'past_due', 'trialing'].includes(data.status)
  } else {
    const { data } = await supabase.from('invoices').select('status, total_minor, number').eq('id', id).maybeSingle()
    if (!data) notFound()
    title = data.number
    detail = data.number
    amountMinor = data.total_minor
    payable = data.status === 'issued'
  }

  const provider = activeProvider()

  return (
    <Container className="max-w-xl py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-lift sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-gold">
            <Lock className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>

        {provider?.mode === 'sandbox' ? <Notice tone="warning" className="mb-4" title={t('sandboxBadge')} /> : null}

        <dl className="divide-y rounded-xl border">
          <div className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{t('item')}</dt>
            <dd className="text-end font-semibold">
              {title}
              <div className="text-xs font-normal text-muted-foreground">{detail}</div>
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="font-bold">{t('amount')}</dt>
            <dd className="text-lg font-bold">{formatMoney(amountMinor, locale)}</dd>
          </div>
        </dl>

        {expired ? (
          <EmptyState icon={TimerOff} title={t('holdExpired')} className="mt-6" action={<Button asChild><Link href="/lawyers">{te('appointment.EXPIRED')}</Link></Button>} />
        ) : !payable ? (
          <Notice tone="info" className="mt-6" title={t('notPayable')} />
        ) : !provider ? (
          <Notice tone="warning" className="mt-6" title={t('providerNotConfigured')} />
        ) : (
          <>
            {holdUntil ? <p className="mt-4 text-center text-sm text-muted-foreground">{t('holdExpires', { time: formatTime(holdUntil, locale) })}</p> : null}
            <PayButton type={type as 'appointment'} id={id} label={t('pay', { amount: formatMoney(amountMinor, locale) })} className="mt-4 w-full" />
            <p className="mt-3 text-center text-xs text-muted-foreground">{t('methods')}</p>
          </>
        )}
        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t('secure')}
        </p>
      </div>
    </Container>
  )
}
