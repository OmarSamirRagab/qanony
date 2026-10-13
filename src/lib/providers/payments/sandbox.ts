import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { CheckoutRequest, CheckoutSession, PaymentEvent, PaymentProvider, RefundRequest, RefundResult } from './types'

/**
 * SANDBOX payment provider — a simulated gateway for development, QA and E2E
 * tests. It never moves money. Payments made through it are stored with
 * provider='sandbox' and provider_mode='sandbox' and are labelled in every UI.
 *
 * Enabled only when PAYMENTS_SANDBOX_ENABLED=true and PAYMENTS_SANDBOX_SECRET
 * is set. Its callbacks are HMAC-signed and go through exactly the same
 * verification pipeline (record_payment_result) as a real gateway.
 */
export function sandboxSign(payload: SandboxCallback, secret = process.env.PAYMENTS_SANDBOX_SECRET ?? ''): string {
  const canonical = [payload.event_id, payload.payment_id, payload.provider_order_id, payload.success ? '1' : '0', payload.amount_minor, payload.currency].join('|')
  return createHmac('sha256', secret).update(canonical).digest('hex')
}

export interface SandboxCallback {
  event_id: string
  payment_id: string
  provider_order_id: string
  success: boolean
  amount_minor: number
  currency: string
}

export const sandboxProvider: PaymentProvider = {
  id: 'sandbox',
  mode: 'sandbox',

  isConfigured() {
    return process.env.PAYMENTS_SANDBOX_ENABLED === 'true' && Boolean(process.env.PAYMENTS_SANDBOX_SECRET)
  },

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    return { providerOrderId: `sbx_${req.paymentId}_${Date.now().toString(36)}`, redirectUrl: `/checkout/sandbox/${req.paymentId}` }
  },

  async parseWebhook(req: Request): Promise<PaymentEvent> {
    const signature = req.headers.get('x-sandbox-signature') ?? ''
    const body = (await req.json().catch(() => ({}))) as Partial<SandboxCallback>
    const cb: SandboxCallback = {
      event_id: String(body.event_id ?? ''),
      payment_id: String(body.payment_id ?? ''),
      provider_order_id: String(body.provider_order_id ?? ''),
      success: body.success === true,
      amount_minor: Number(body.amount_minor ?? 0),
      currency: String(body.currency ?? 'EGP'),
    }
    const expected = Buffer.from(sandboxSign(cb), 'hex')
    const given = Buffer.from(signature, 'hex')
    const signatureValid = expected.length === given.length && expected.length > 0 && timingSafeEqual(expected, given)
    return {
      kind: 'transaction',
      eventId: cb.event_id || randomUUID(),
      paymentRef: cb.payment_id || null,
      providerOrderId: cb.provider_order_id || null,
      transactionId: `sbx_txn_${cb.event_id}`,
      success: cb.success,
      amountMinor: cb.amount_minor,
      currency: cb.currency,
      gatewayFeeMinor: 0,
      signatureValid,
      failureReason: cb.success ? undefined : 'sandbox_declined',
      payload: { ...cb, sandbox: true },
    }
  },

  async refund(req: RefundRequest): Promise<RefundResult> {
    return { ok: true, providerRefundId: `sbx_rf_${req.refundId}` }
  },
}
