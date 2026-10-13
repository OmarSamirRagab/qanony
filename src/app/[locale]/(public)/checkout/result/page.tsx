import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { z } from 'zod'
import { Container } from '@/components/shared'
import { PaymentResult } from '@/features/payments/components/payment-result'
import { toLocale } from '@/i18n/routing'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { robots: { index: false } }

export default async function CheckoutResultPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ payment?: string; ref?: string }> }) {
  const { locale } = await params
  setRequestLocale(toLocale(locale))
  await requireUser('/client/payments')
  const sp = await searchParams
  const paymentId = z.uuid().safeParse(sp.payment).success ? sp.payment : undefined
  const reference = sp.ref && /^PAY-\d{4}-\d{7}$/.test(sp.ref) ? sp.ref : undefined
  return (
    <Container className="max-w-lg py-16">
      <div className="rounded-2xl border bg-card p-8 shadow-lift">
        <PaymentResult paymentId={paymentId} reference={reference} />
      </div>
    </Container>
  )
}
