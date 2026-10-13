'use server'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { fail, fromDb, ok, type ActionResult } from '@/lib/action'
import { siteUrl } from '@/lib/env'
import { activeProvider, recordPaymentEvent } from '@/lib/providers/payments'
import { sandboxProvider, sandboxSign, type SandboxCallback } from '@/lib/providers/payments/sandbox'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

const payableSchema = z.object({ type: z.enum(['appointment', 'service_order', 'subscription', 'invoice']), id: z.uuid() })

/**
 * Creates (or reuses) a payment for a payable the caller owns, opens a checkout
 * session with the active provider and redirects there. The amount is always
 * computed by the database.
 */
export async function startCheckout(input: { type: Enums<'payable_type'>; id: string }): Promise<ActionResult> {
  const parsed = payableSchema.safeParse(input)
  if (!parsed.success) return fail('notFound')
  const provider = activeProvider()
  if (!provider || !isServiceRoleConfigured()) return fail('notConfigured')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')

  const { data: payment, error } = await supabase.rpc('create_payment', {
    p_payable_type: parsed.data.type,
    p_payable_id: parsed.data.id,
    p_provider: provider.id,
    p_provider_mode: provider.mode,
    p_idempotency_key: `${parsed.data.type}:${parsed.data.id}:${provider.id}:${randomUUID()}`,
  })
  if (error || !payment) return fromDb(error ?? {})

  const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', auth.user.id).single()
  const locale = await getLocale()
  const prefix = locale === 'ar' ? '' : `/${locale}`
  let session
  try {
    session = await provider.createCheckout({
      paymentId: payment.id,
      reference: payment.reference,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      description: `Qanony ${parsed.data.type} ${payment.reference}`,
      customer: { name: profile?.full_name || 'Client', email: auth.user.email ?? 'client@example.com', phone: profile?.phone ?? null },
      returnUrl: siteUrl(`/api/payments/return/${provider.id}`),
      webhookUrl: siteUrl(`/api/payments/${provider.id}/webhook`),
    })
  } catch (e) {
    console.error('[checkout] provider error', e)
    return fail('providerUnavailable')
  }
  const { error: attachError } = await createAdminClient().rpc('attach_provider_order', { p_payment_id: payment.id, p_provider_order_id: session.providerOrderId })
  if (attachError) return fromDb(attachError)
  redirect(session.redirectUrl.startsWith('/') ? `${prefix}${session.redirectUrl}` : session.redirectUrl)
}

/**
 * Sandbox gateway simulation. Builds an HMAC-signed callback exactly like an
 * external gateway would and runs it through the normal verification path.
 */
export async function completeSandboxPayment(paymentId: string, success: boolean): Promise<ActionResult<{ result: string }>> {
  if (!sandboxProvider.isConfigured()) return fail('notConfigured')
  if (!z.uuid().safeParse(paymentId).success) return fail('notFound')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('unauthenticated')
  // Only the payer can drive their own sandbox checkout.
  const { data: payment } = await supabase.from('payments').select('id, payer_id, amount_minor, currency, provider, provider_order_id').eq('id', paymentId).maybeSingle()
  if (!payment || payment.payer_id !== auth.user.id || payment.provider !== 'sandbox') return fail('notFound')

  const cb: SandboxCallback = {
    event_id: randomUUID(),
    payment_id: payment.id,
    provider_order_id: payment.provider_order_id ?? '',
    success,
    amount_minor: payment.amount_minor,
    currency: payment.currency,
  }
  const req = new Request('http://sandbox.local/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': sandboxSign(cb) },
    body: JSON.stringify(cb),
  })
  const event = await sandboxProvider.parseWebhook(req)
  try {
    return ok({ result: await recordPaymentEvent(sandboxProvider, event) })
  } catch {
    return fail('unknown')
  }
}

export async function cancelPendingPayment(paymentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(paymentId).success) return fail('notFound')
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_pending_payment', { p_payment_id: paymentId })
  return error ? fromDb(error) : ok()
}
