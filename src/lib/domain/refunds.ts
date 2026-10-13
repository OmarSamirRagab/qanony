/** Refund policy. Mirrors app.appointment_refund_percent(). */
export type CancelActor = 'client' | 'lawyer' | 'admin' | 'system'

export interface RefundPolicyInput {
  actor: CancelActor
  status: string
  startsAt: Date
  occupiesSlot: boolean
  startedAt?: Date | null
  cancellationDeadlineHours: number
  lateCancelRefundPercent: number
  now?: Date
}

export function appointmentRefundPercent(input: RefundPolicyInput): number {
  const now = input.now ?? new Date()
  if (input.actor !== 'client') return 100
  if (['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'EXPIRED'].includes(input.status)) return 100
  if (!input.occupiesSlot) return input.status === 'CONFIRMED' && !input.startedAt ? 100 : 0
  const msBefore = input.startsAt.getTime() - now.getTime()
  if (msBefore >= input.cancellationDeadlineHours * 3_600_000) return 100
  if (msBefore > 0) return Math.max(0, Math.min(100, input.lateCancelRefundPercent))
  return 0
}

export function refundAmountMinor(paidMinor: number, alreadyRefundedMinor: number, percent: number): number {
  const target = Math.floor((paidMinor * Math.min(100, Math.max(0, percent))) / 100)
  return Math.max(0, Math.min(target, paidMinor - alreadyRefundedMinor))
}
