/**
 * Commission resolution and calculation. Mirrors app.resolve_commission_rule()
 * and app.compute_commission_minor() — the database is authoritative and stores
 * an immutable snapshot on each payment; this module powers previews and tests.
 */
export type CommissionScope = 'global' | 'firm' | 'lawyer' | 'service' | 'promotion'
export type PayableType = 'appointment' | 'service_order' | 'subscription' | 'invoice'

export interface CommissionRule {
  id: string
  scope: CommissionScope
  lawyerId?: string | null
  firmId?: string | null
  serviceId?: string | null
  appliesTo?: PayableType | null
  rateBps: number
  fixedMinor?: number
  startsAt?: Date | null
  endsAt?: Date | null
  isActive: boolean
  createdAt: Date
}

export interface CommissionContext {
  payable: PayableType
  lawyerId?: string | null
  firmId?: string | null
  serviceId?: string | null
  at?: Date
}

const PRECEDENCE: Record<CommissionScope, number> = { service: 1, lawyer: 2, firm: 3, promotion: 4, global: 5 }

function matches(rule: CommissionRule, ctx: CommissionContext): boolean {
  const at = ctx.at ?? new Date()
  if (!rule.isActive) return false
  if (rule.appliesTo && rule.appliesTo !== ctx.payable) return false
  if (rule.startsAt && rule.startsAt > at) return false
  if (rule.endsAt && rule.endsAt <= at) return false
  switch (rule.scope) {
    case 'service':
      return !!ctx.serviceId && rule.serviceId === ctx.serviceId
    case 'lawyer':
      return !!ctx.lawyerId && rule.lawyerId === ctx.lawyerId
    case 'firm':
      return !!ctx.firmId && rule.firmId === ctx.firmId
    case 'promotion':
      return (
        (!rule.serviceId || rule.serviceId === ctx.serviceId) &&
        (!rule.lawyerId || rule.lawyerId === ctx.lawyerId) &&
        (!rule.firmId || rule.firmId === ctx.firmId)
      )
    case 'global':
      return true
  }
}

export function resolveCommissionRule(rules: CommissionRule[], ctx: CommissionContext): CommissionRule | null {
  const candidates = rules.filter((r) => matches(r, ctx))
  candidates.sort((a, b) => PRECEDENCE[a.scope] - PRECEDENCE[b.scope] || b.createdAt.getTime() - a.createdAt.getTime())
  return candidates[0] ?? null
}

/** Round-half-up on the percentage part, plus fixed fee, capped at the gross amount. */
export function computeCommissionMinor(amountMinor: number, rateBps: number, fixedMinor = 0): number {
  if (amountMinor < 0 || rateBps < 0) throw new RangeError('Negative amounts are not allowed')
  const pct = Math.floor((amountMinor * rateBps + 5000) / 10000)
  return Math.min(amountMinor, pct + fixedMinor)
}

export interface PaymentBreakdown {
  grossMinor: number
  commissionMinor: number
  gatewayFeeMinor: number
  /** gateway fee charged to the beneficiary (0 when the platform bears it) */
  beneficiaryFeeMinor: number
  netMinor: number
}

export function paymentBreakdown(
  amountMinor: number,
  rule: Pick<CommissionRule, 'rateBps' | 'fixedMinor'> | null,
  gatewayFeeMinor = 0,
  feeBearer: 'platform' | 'beneficiary' = 'platform',
): PaymentBreakdown {
  const commissionMinor = computeCommissionMinor(amountMinor, rule?.rateBps ?? 0, rule?.fixedMinor ?? 0)
  const beneficiaryFeeMinor = feeBearer === 'beneficiary' ? Math.min(gatewayFeeMinor, amountMinor - commissionMinor) : 0
  return {
    grossMinor: amountMinor,
    commissionMinor,
    gatewayFeeMinor,
    beneficiaryFeeMinor,
    netMinor: amountMinor - commissionMinor - beneficiaryFeeMinor,
  }
}

/** Splits a refund between beneficiary and platform proportionally to the original split. */
export function refundSplit(refundMinor: number, payment: { amountMinor: number; netMinor: number }) {
  const beneficiary = Math.floor((refundMinor * payment.netMinor) / payment.amountMinor)
  return { beneficiaryMinor: beneficiary, platformMinor: refundMinor - beneficiary }
}
