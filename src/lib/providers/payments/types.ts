export type ProviderId = 'paymob' | 'sandbox'
export type ProviderMode = 'live' | 'test' | 'sandbox'

export interface CheckoutRequest {
  paymentId: string
  reference: string
  amountMinor: number
  currency: string
  description: string
  customer: { name: string; email: string; phone: string | null }
  returnUrl: string
  webhookUrl: string
}

export interface CheckoutSession {
  providerOrderId: string
  redirectUrl: string
}

/** Provider-agnostic, verified payment event handed to record_payment_result(). */
export interface PaymentEvent {
  kind: 'transaction' | 'ignored'
  eventId: string
  paymentRef: string | null
  providerOrderId: string | null
  transactionId: string | null
  success: boolean
  amountMinor: number
  currency: string
  gatewayFeeMinor: number
  signatureValid: boolean
  failureReason?: string
  /** Redacted payload for the audit trail (no card data). */
  payload: Record<string, unknown>
}

export interface RefundRequest {
  transactionId: string
  amountMinor: number
  refundId: string
}

export interface RefundResult {
  ok: boolean
  providerRefundId?: string
  error?: string
}

export interface PaymentProvider {
  id: ProviderId
  mode: ProviderMode
  isConfigured(): boolean
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>
  parseWebhook(req: Request): Promise<PaymentEvent>
  refund(req: RefundRequest): Promise<RefundResult>
}
