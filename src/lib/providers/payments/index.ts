import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { paymobProvider } from './paymob'
import { sandboxProvider } from './sandbox'
import type { PaymentEvent, PaymentProvider, ProviderId } from './types'

const PROVIDERS: Record<ProviderId, PaymentProvider> = { paymob: paymobProvider, sandbox: sandboxProvider }

export function getProvider(id: string): PaymentProvider | null {
  return id in PROVIDERS ? PROVIDERS[id as ProviderId] : null
}

/** The provider used for new checkouts (PAYMENTS_PROVIDER), only if fully configured. */
export function activeProvider(): PaymentProvider | null {
  const id = (process.env.PAYMENTS_PROVIDER ?? (process.env.PAYMENTS_SANDBOX_ENABLED === 'true' ? 'sandbox' : 'paymob')) as ProviderId
  const provider = getProvider(id)
  return provider?.isConfigured() ? provider : null
}

/**
 * Hands a verified, normalised gateway event to the database. The database
 * de-duplicates by (provider, event id), checks signature validity and amount,
 * snapshots commission, writes the ledger and fulfils the booking/order —
 * all in one transaction.
 */
export async function recordPaymentEvent(provider: PaymentProvider, event: PaymentEvent): Promise<string> {
  if (event.kind === 'ignored') return 'ignored'
  const { data, error } = await createAdminClient().rpc('record_payment_result', {
    p_provider: provider.id,
    p_event_id: event.eventId,
    p_payment_ref: event.paymentRef,
    p_provider_order_id: event.providerOrderId,
    p_transaction_id: event.transactionId,
    p_success: event.success,
    p_amount_minor: event.amountMinor,
    p_currency: event.currency,
    p_gateway_fee_minor: event.gatewayFeeMinor,
    p_signature_valid: event.signatureValid,
    p_payload: { ...event.payload, failure_reason: event.failureReason ?? null },
  })
  if (error) {
    console.error('[payments] record_payment_result failed', error.code, error.message)
    throw new Error('payment_record_failed')
  }
  return data as string
}

export type { PaymentProvider, PaymentEvent } from './types'
