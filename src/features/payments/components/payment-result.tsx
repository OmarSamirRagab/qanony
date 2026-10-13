'use client'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Polls the payment status written by the verified gateway callback. The
 * browser redirect itself is never treated as proof of payment.
 */
export function PaymentResult({ paymentId, reference }: { paymentId?: string; reference?: string }) {
  const t = useTranslations('payments.result')
  const [startedAt] = useState(() => Date.now())
  const [timedOut, setTimedOut] = useState(false)

  const { data } = useQuery({
    queryKey: ['payment-result', paymentId, reference],
    queryFn: async () => {
      let q = getBrowserClient().from('payments').select('id, status, payable_type, appointment_id, service_order_id, subscription_id, refunded_minor')
      q = paymentId ? q.eq('id', paymentId) : q.eq('reference', reference ?? '')
      const { data: payment } = await q.maybeSingle()
      if (!payment) return null
      const { count } = await getBrowserClient().from('refunds').select('id', { count: 'exact', head: true }).eq('payment_id', payment.id)
      return { ...payment, refundRequired: (count ?? 0) > 0 }
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'succeeded' || s === 'failed' || s === 'cancelled' || s === 'refunded' || timedOut ? false : 2000
    },
  })

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 60_000 - (Date.now() - startedAt))
    return () => clearTimeout(id)
  }, [startedAt])

  const status = data?.status
  const target = data?.appointment_id
    ? { href: `/client/appointments/${data.appointment_id}`, label: t('viewAppointment') }
    : data?.service_order_id
      ? { href: `/client/orders/${data.service_order_id}`, label: t('viewOrder') }
      : { href: '/client/payments', label: t('viewPayments') }

  if (status === 'succeeded' || status === 'partially_refunded' || status === 'refunded') {
    return (
      <div className="text-center" data-testid="payment-success">
        <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">{t('success')}</h1>
        <p className="mt-2 text-muted-foreground">{data?.refundRequired ? t('refundRequired') : t('successBody')}</p>
        <Button asChild className="mt-6">
          <Link href={data?.subscription_id ? '/lawyer/subscription' : target.href}>{target.label}</Link>
        </Button>
      </div>
    )
  }
  if (status === 'failed' || status === 'cancelled') {
    return (
      <div className="text-center" data-testid="payment-failed">
        <XCircle className="mx-auto size-14 text-destructive" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">{t('failed')}</h1>
        <p className="mt-2 text-muted-foreground">{t('failedBody')}</p>
        {data?.appointment_id || data?.service_order_id ? (
          <Button asChild className="mt-6">
            <Link href={data.appointment_id ? `/checkout/appointment/${data.appointment_id}` : `/checkout/service_order/${data.service_order_id}`}>
              <RotateCcw aria-hidden /> {t('tryAgain')}
            </Link>
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="text-center" data-testid="payment-pending">
      {timedOut ? <Clock className="mx-auto size-14 text-warning" aria-hidden /> : <Loader2 className="mx-auto size-14 animate-spin text-gold" aria-hidden />}
      <h1 className="mt-4 text-2xl font-bold">{t('checking')}</h1>
      <p className="mt-2 text-muted-foreground">{timedOut ? t('pendingLong') : t('checkingBody')}</p>
      {timedOut ? (
        <Button asChild variant="outline" className="mt-6">
          <Link href="/client/payments">{t('viewPayments')}</Link>
        </Button>
      ) : null}
    </div>
  )
}
