import { FlaskConical } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { z } from 'zod'
import { Container } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { SandboxGateway } from '@/features/payments/components/sandbox-gateway'
import { toLocale } from '@/i18n/routing'
import { requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { sandboxProvider } from '@/lib/providers/payments/sandbox'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { robots: { index: false } }

export default async function SandboxCheckoutPage({ params }: { params: Promise<{ locale: string; paymentId: string }> }) {
  const { locale: raw, paymentId } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  if (!z.uuid().safeParse(paymentId).success) notFound()
  const ctx = await requireUser()
  const t = await getTranslations('payments.sandbox')
  if (!sandboxProvider.isConfigured()) {
    return (
      <Container className="max-w-xl py-12">
        <Notice tone="warning" title={t('disabled')} />
      </Container>
    )
  }
  const supabase = await createClient()
  const { data: payment } = await supabase.from('payments').select('id, reference, amount_minor, status, payer_id, provider').eq('id', paymentId).maybeSingle()
  if (!payment || payment.payer_id !== ctx.userId || payment.provider !== 'sandbox') notFound()

  return (
    <Container className="max-w-xl py-12">
      <div className="rounded-2xl border-2 border-dashed border-warning/50 bg-card p-8 shadow-lift">
        <div className="mb-4 flex items-center gap-3">
          <FlaskConical className="size-8 text-warning" aria-hidden />
          <h1 className="text-xl font-bold">{t('title')}</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{t('body')}</p>
        <div className="mb-6 rounded-xl bg-muted p-4 text-center">
          <div className="font-mono text-xs text-muted-foreground">{payment.reference}</div>
          <div className="mt-1 text-2xl font-bold">{formatMoney(payment.amount_minor, locale)}</div>
        </div>
        <SandboxGateway paymentId={payment.id} />
      </div>
    </Container>
  )
}
