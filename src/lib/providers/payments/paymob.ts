import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CheckoutRequest, CheckoutSession, PaymentEvent, PaymentProvider, RefundRequest, RefundResult } from './types'

/**
 * Paymob (Egypt) adapter — Unified Intention API.
 *
 * Status: implemented against Paymob's public documentation; it has NOT been
 * verified against a live Paymob account from this codebase. Verify in Paymob
 * test mode before enabling (see DEPLOYMENT.md).
 *
 * Env: PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET,
 *      PAYMOB_INTEGRATION_IDS (comma-separated), PAYMOB_API_BASE, PAYMOB_MODE (test|live)
 */
const BASE = () => (process.env.PAYMOB_API_BASE ?? 'https://accept.paymob.com').replace(/\/$/, '')

// Field order defined by Paymob for the transaction-processed callback HMAC.
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const

function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj)
}

export function paymobHmac(obj: Record<string, unknown>, secret: string): string {
  const concatenated = HMAC_FIELDS.map((f) => {
    const v = get(obj, f)
    return v === undefined || v === null ? '' : String(v)
  }).join('')
  return createHmac('sha512', secret).update(concatenated).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb)
}

/** Our payment reference is the merchant reference minus the trailing attempt suffix. */
export function paymentRefFromMerchant(merchantOrderId: unknown): string | null {
  if (typeof merchantOrderId !== 'string' || !merchantOrderId.includes('-')) return null
  return merchantOrderId.slice(0, merchantOrderId.lastIndexOf('-'))
}

export const paymobProvider: PaymentProvider = {
  id: 'paymob',
  get mode() {
    return process.env.PAYMOB_MODE === 'live' ? 'live' : 'test'
  },

  isConfigured() {
    return Boolean(process.env.PAYMOB_SECRET_KEY && process.env.PAYMOB_PUBLIC_KEY && process.env.PAYMOB_HMAC_SECRET && process.env.PAYMOB_INTEGRATION_IDS)
  },

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const [first, ...rest] = req.customer.name.trim().split(/\s+/)
    const body = {
      amount: req.amountMinor,
      currency: req.currency,
      payment_methods: (process.env.PAYMOB_INTEGRATION_IDS ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean),
      items: [{ name: req.description.slice(0, 50), amount: req.amountMinor, description: req.reference, quantity: 1 }],
      billing_data: {
        first_name: first || 'Client',
        last_name: rest.join(' ') || 'Qanony',
        email: req.customer.email,
        phone_number: req.customer.phone ?? '+201000000000',
        country: 'EG',
      },
      special_reference: `${req.reference}-${Date.now().toString(36)}`,
      notification_url: req.webhookUrl,
      redirection_url: req.returnUrl,
    }
    const res = await fetch(`${BASE()}/v1/intention/`, {
      method: 'POST',
      headers: { Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`Paymob intention failed: ${res.status}`)
    const data = (await res.json()) as { client_secret?: string; intention_order_id?: number | string; id?: string }
    if (!data.client_secret) throw new Error('Paymob intention missing client_secret')
    const redirectUrl = `${BASE()}/unifiedcheckout/?publicKey=${encodeURIComponent(process.env.PAYMOB_PUBLIC_KEY!)}&clientSecret=${encodeURIComponent(data.client_secret)}`
    return { providerOrderId: String(data.intention_order_id ?? data.id), redirectUrl }
  },

  async parseWebhook(req: Request): Promise<PaymentEvent> {
    const url = new URL(req.url)
    const hmac = url.searchParams.get('hmac') ?? ''
    const body = (await req.json().catch(() => ({}))) as { type?: string; obj?: Record<string, unknown> }
    const obj = body.obj ?? {}
    const expected = paymobHmac(obj, process.env.PAYMOB_HMAC_SECRET ?? '')
    const signatureValid = Boolean(hmac) && safeEqualHex(hmac.toLowerCase(), expected)
    const order = (obj.order ?? {}) as Record<string, unknown>
    const isRefundOrVoid = obj.is_refunded === true || obj.is_voided === true
    const success = obj.success === true && obj.pending !== true
    return {
      kind: body.type === 'TRANSACTION' && !isRefundOrVoid ? 'transaction' : 'ignored',
      eventId: `txn:${String(obj.id)}:${success}:${String(obj.is_refunded)}:${String(obj.is_voided)}`,
      paymentRef: paymentRefFromMerchant(order.merchant_order_id),
      providerOrderId: order.id != null ? String(order.id) : null,
      transactionId: obj.id != null ? String(obj.id) : null,
      success,
      amountMinor: Number(obj.amount_cents ?? 0),
      currency: String(obj.currency ?? 'EGP'),
      gatewayFeeMinor: 0, // Paymob fees are reconciled from settlement reports
      signatureValid,
      failureReason: success ? undefined : String((obj.data as Record<string, unknown> | undefined)?.message ?? 'declined').slice(0, 200),
      payload: {
        id: obj.id,
        success: obj.success,
        pending: obj.pending,
        amount_cents: obj.amount_cents,
        currency: obj.currency,
        order_id: order.id,
        merchant_order_id: order.merchant_order_id,
        source_type: get(obj, 'source_data.type'),
        source_sub_type: get(obj, 'source_data.sub_type'),
        is_refunded: obj.is_refunded,
        is_voided: obj.is_voided,
      },
    }
  },

  async refund(req: RefundRequest): Promise<RefundResult> {
    const res = await fetch(`${BASE()}/api/acceptance/void_refund/refund`, {
      method: 'POST',
      headers: { Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: req.transactionId, amount_cents: req.amountMinor }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await res.json().catch(() => ({}))) as { id?: number | string; success?: boolean; detail?: string; message?: string }
    if (!res.ok || data.success === false) return { ok: false, error: data.detail ?? data.message ?? `HTTP ${res.status}` }
    return { ok: true, providerRefundId: data.id != null ? String(data.id) : undefined }
  },
}
