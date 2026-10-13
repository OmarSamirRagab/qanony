import { describe, expect, it } from 'vitest'
import { findWindowProblems, generateSlots, groupSlotsByDay, localDate } from '@/lib/domain/availability'
import { computeCommissionMinor, paymentBreakdown, refundSplit, resolveCommissionRule, type CommissionRule } from '@/lib/domain/commission'
import { featureLimit, hasFeature, requireFeature, withinLimit, type Entitlements } from '@/lib/domain/entitlements'
import { invoiceTotals } from '@/lib/domain/invoice'
import { formatMoney, percentOf, toMinor } from '@/lib/domain/money'
import { canAccessPortal, canEditSetting, defaultPortalPath, hasPlatformPermission, portalForPath } from '@/lib/domain/permissions'
import { appointmentRefundPercent, refundAmountMinor } from '@/lib/domain/refunds'
import { reviewFlags, smoothedRating } from '@/lib/domain/reviews'
import {
  APPOINTMENT_TRANSITIONS,
  MATTER_TRANSITIONS,
  SERVICE_ORDER_TRANSITIONS,
  availableAppointmentActions,
  canJoinMeeting,
  canTransition,
} from '@/lib/domain/status'

describe('money', () => {
  it('converts and formats EGP', () => {
    expect(toMinor(499.99)).toBe(49999)
    expect(percentOf(50000, 50)).toBe(25000)
    expect(percentOf(333, 33)).toBe(109)
    expect(formatMoney(50000, 'en')).toMatch(/500/)
    expect(formatMoney(50000, 'ar')).toMatch(/٥٠٠|500/)
  })
})

describe('commission', () => {
  const t = (s: string) => new Date(s)
  const rules: CommissionRule[] = [
    { id: 'g', scope: 'global', rateBps: 1500, isActive: true, createdAt: t('2026-01-01') },
    { id: 'f', scope: 'firm', firmId: 'F1', rateBps: 1200, isActive: true, createdAt: t('2026-01-02') },
    { id: 'l', scope: 'lawyer', lawyerId: 'L1', rateBps: 1000, isActive: true, createdAt: t('2026-01-03') },
    { id: 's', scope: 'service', serviceId: 'S1', rateBps: 500, isActive: true, createdAt: t('2026-01-04') },
    { id: 'p', scope: 'promotion', rateBps: 0, startsAt: t('2026-06-01'), endsAt: t('2026-07-01'), isActive: true, createdAt: t('2026-05-01') },
    { id: 'x', scope: 'lawyer', lawyerId: 'L2', rateBps: 0, isActive: false, createdAt: t('2026-01-05') },
  ]
  it('resolves by precedence service > lawyer > firm > promotion > global', () => {
    const at = t('2026-03-01')
    expect(resolveCommissionRule(rules, { payable: 'service_order', serviceId: 'S1', lawyerId: 'L1', firmId: 'F1', at })!.id).toBe('s')
    expect(resolveCommissionRule(rules, { payable: 'appointment', lawyerId: 'L1', firmId: 'F1', at })!.id).toBe('l')
    expect(resolveCommissionRule(rules, { payable: 'appointment', lawyerId: 'L9', firmId: 'F1', at })!.id).toBe('f')
    expect(resolveCommissionRule(rules, { payable: 'appointment', lawyerId: 'L9', at })!.id).toBe('g')
    expect(resolveCommissionRule(rules, { payable: 'appointment', lawyerId: 'L9', at: t('2026-06-15') })!.id).toBe('p')
    expect(resolveCommissionRule(rules, { payable: 'appointment', lawyerId: 'L2', at })!.id).toBe('g')
  })
  it('computes commission with half-up rounding, fixed fee and cap', () => {
    expect(computeCommissionMinor(50000, 1500)).toBe(7500)
    expect(computeCommissionMinor(333, 1500)).toBe(50) // 49.95 -> 50
    expect(computeCommissionMinor(1000, 1000, 200)).toBe(300)
    expect(computeCommissionMinor(100, 5000, 1000)).toBe(100)
    expect(() => computeCommissionMinor(-1, 100)).toThrow()
  })
  it('splits payments and refunds consistently', () => {
    expect(paymentBreakdown(50000, { rateBps: 1500 }, 1500)).toEqual({ grossMinor: 50000, commissionMinor: 7500, gatewayFeeMinor: 1500, beneficiaryFeeMinor: 0, netMinor: 42500 })
    expect(paymentBreakdown(50000, { rateBps: 1500 }, 1500, 'beneficiary').netMinor).toBe(41000)
    const split = refundSplit(25000, { amountMinor: 50000, netMinor: 42500 })
    expect(split).toEqual({ beneficiaryMinor: 21250, platformMinor: 3750 })
    const odd = refundSplit(333, { amountMinor: 1000, netMinor: 850 })
    expect(odd.beneficiaryMinor + odd.platformMinor).toBe(333)
  })
})

describe('refund policy', () => {
  const base = { status: 'CONFIRMED', occupiesSlot: true, cancellationDeadlineHours: 24, lateCancelRefundPercent: 50, now: new Date('2026-10-01T10:00:00Z') }
  it('gives full refunds before the deadline and for lawyer/admin cancellations', () => {
    expect(appointmentRefundPercent({ ...base, actor: 'client', startsAt: new Date('2026-10-03T10:00:00Z') })).toBe(100)
    expect(appointmentRefundPercent({ ...base, actor: 'lawyer', startsAt: new Date('2026-10-01T11:00:00Z') })).toBe(100)
    expect(appointmentRefundPercent({ ...base, actor: 'client', status: 'PENDING_CONFIRMATION', startsAt: new Date('2026-10-01T11:00:00Z') })).toBe(100)
  })
  it('gives a partial refund after the deadline and none after the start', () => {
    expect(appointmentRefundPercent({ ...base, actor: 'client', startsAt: new Date('2026-10-01T20:00:00Z') })).toBe(50)
    expect(appointmentRefundPercent({ ...base, actor: 'client', startsAt: new Date('2026-10-01T09:00:00Z') })).toBe(0)
  })
  it('handles written opinions by work status', () => {
    expect(appointmentRefundPercent({ ...base, actor: 'client', occupiesSlot: false, startsAt: base.now })).toBe(100)
    expect(appointmentRefundPercent({ ...base, actor: 'client', occupiesSlot: false, startsAt: base.now, startedAt: base.now })).toBe(0)
  })
  it('never refunds more than remains', () => {
    expect(refundAmountMinor(50000, 0, 50)).toBe(25000)
    expect(refundAmountMinor(50000, 40000, 50)).toBe(10000)
    expect(refundAmountMinor(50000, 50000, 100)).toBe(0)
  })
})

describe('status machines', () => {
  it('has no transitions out of terminal states and only known targets', () => {
    expect(APPOINTMENT_TRANSITIONS.REFUNDED).toEqual([])
    expect(SERVICE_ORDER_TRANSITIONS.REFUNDED).toEqual([])
    expect(MATTER_TRANSITIONS.ARCHIVED).toEqual([])
    for (const map of [APPOINTMENT_TRANSITIONS, SERVICE_ORDER_TRANSITIONS, MATTER_TRANSITIONS] as Record<string, string[]>[]) {
      for (const targets of Object.values(map)) for (const t of targets) expect(Object.keys(map)).toContain(t)
    }
    expect(canTransition(APPOINTMENT_TRANSITIONS, 'COMPLETED', 'CONFIRMED')).toBe(false)
    expect(canTransition(MATTER_TRANSITIONS, 'CLOSED', 'ARCHIVED')).toBe(true)
  })
  it('offers time-dependent actions to lawyers and only cancel to clients', () => {
    const startsAt = new Date('2026-10-01T10:00:00Z')
    const endsAt = new Date('2026-10-01T10:30:00Z')
    const ctx = { status: 'CONFIRMED' as const, startsAt, endsAt, occupiesSlot: true }
    expect(availableAppointmentActions('lawyer', { ...ctx, now: new Date('2026-09-30T10:00:00Z') })).toEqual(['CANCELLED'])
    expect(availableAppointmentActions('lawyer', { ...ctx, now: new Date('2026-10-01T09:50:00Z') })).toEqual(['IN_PROGRESS', 'CANCELLED'])
    expect(availableAppointmentActions('lawyer', { ...ctx, now: new Date('2026-10-01T10:20:00Z') })).toEqual(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    expect(availableAppointmentActions('client', { ...ctx, now: new Date('2026-09-30T10:00:00Z') })).toEqual(['CANCELLED'])
    expect(availableAppointmentActions('client', { ...ctx, status: 'COMPLETED' })).toEqual([])
  })
  it('opens the meeting room 10 minutes early and closes 30 minutes after', () => {
    const s = new Date('2026-10-01T10:00:00Z')
    const e = new Date('2026-10-01T10:30:00Z')
    expect(canJoinMeeting('CONFIRMED', s, e, new Date('2026-10-01T09:49:00Z'))).toBe(false)
    expect(canJoinMeeting('CONFIRMED', s, e, new Date('2026-10-01T09:51:00Z'))).toBe(true)
    expect(canJoinMeeting('IN_PROGRESS', s, e, new Date('2026-10-01T11:01:00Z'))).toBe(false)
    expect(canJoinMeeting('CANCELLED', s, e, new Date('2026-10-01T10:05:00Z'))).toBe(false)
  })
})

describe('availability', () => {
  const rules = { timezone: 'Africa/Cairo', durationMinutes: 30, bufferMinutes: 10, minNoticeHours: 0, maxAdvanceDays: 60 }
  const windows = [{ weekday: 0, startTime: '10:00', endTime: '12:00' }] // Sundays
  const now = new Date('2026-10-01T00:00:00Z') // Thursday

  it('generates grid slots in the lawyer timezone', () => {
    const slots = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, exceptions: [], busy: [], rules, now })
    // 10:00, 10:40, 11:20 Cairo (UTC+3 in October under DST) → 07:00Z, 07:40Z, 08:20Z
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(['2026-10-04T07:00:00.000Z', '2026-10-04T07:40:00.000Z', '2026-10-04T08:20:00.000Z'])
    expect(localDate(slots[0]!.startsAt, 'Africa/Cairo')).toBe('2026-10-04')
    expect(Object.keys(groupSlotsByDay(slots, 'Africa/Cairo'))).toEqual(['2026-10-04'])
  })

  it('respects bookings with buffer, exceptions, notice and daily caps', () => {
    const busy = [{ startsAt: new Date('2026-10-04T07:40:00Z'), endsAt: new Date('2026-10-04T08:10:00Z') }]
    const s1 = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, exceptions: [], busy, rules, now })
    expect(s1.map((s) => s.startsAt.toISOString())).toEqual(['2026-10-04T07:00:00.000Z', '2026-10-04T08:20:00.000Z'])
    const s2 = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, exceptions: [{ date: '2026-10-04', kind: 'unavailable' }], busy: [], rules, now })
    expect(s2).toEqual([])
    const s3 = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, busy: [], rules, now,
      exceptions: [{ date: '2026-10-04', kind: 'unavailable', startTime: '10:30', endTime: '11:00' }] })
    expect(s3.map((s) => s.startsAt.toISOString())).toEqual(['2026-10-04T07:00:00.000Z', '2026-10-04T08:20:00.000Z'])
    const s4 = generateSlots({ from: '2026-10-05', to: '2026-10-05', windows, busy: [], rules, now,
      exceptions: [{ date: '2026-10-05', kind: 'available', startTime: '18:00', endTime: '19:00' }] })
    expect(s4).toHaveLength(1)
    const s5 = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, exceptions: [], busy: [], rules: { ...rules, maxDailyAppointments: 1 }, now, dailyCounts: { '2026-10-04': 1 } })
    expect(s5).toEqual([])
    const s6 = generateSlots({ from: '2026-10-04', to: '2026-10-04', windows, exceptions: [], busy: [], rules: { ...rules, minNoticeHours: 80 }, now })
    // earliest = 2026-10-04T08:00Z → only the 08:20Z slot remains
    expect(s6.map((s) => s.startsAt.toISOString())).toEqual(['2026-10-04T08:20:00.000Z'])
  })

  it('validates schedule windows', () => {
    expect(findWindowProblems([{ weekday: 1, startTime: '09:00', endTime: '12:00' }, { weekday: 1, startTime: '11:00', endTime: '13:00' }])).toContain('overlap:1')
    expect(findWindowProblems([{ weekday: 2, startTime: '12:00', endTime: '09:00' }])).toContain('end_before_start:2:12:00')
    expect(findWindowProblems([{ weekday: 3, startTime: '09:00', endTime: '12:00' }, { weekday: 3, startTime: '12:00', endTime: '15:00' }])).toEqual([])
  })
})

describe('entitlements', () => {
  const ent: Entitlements = {
    plan: { code: 'basic', name_ar: 'الأساسية', name_en: 'Basic' },
    features: { 'bookings.monthly': { enabled: true, limit: 10 }, analytics: { enabled: false, limit: null }, 'matters.active': { enabled: true, limit: null } },
  }
  it('checks features and limits', () => {
    expect(hasFeature(ent, 'analytics')).toBe(false)
    expect(hasFeature(ent, 'bookings.monthly')).toBe(true)
    expect(withinLimit(ent, 'bookings.monthly', 9)).toBe(true)
    expect(withinLimit(ent, 'bookings.monthly', 10)).toBe(false)
    expect(withinLimit(ent, 'matters.active', 1000)).toBe(true)
    expect(withinLimit(ent, 'templates', 0)).toBe(false)
    expect(featureLimit(ent, 'analytics')).toBe(0)
    expect(() => requireFeature(ent, 'analytics')).toThrow(/analytics/)
  })
})

describe('permissions', () => {
  it('routes users to the right portal and gates access', () => {
    expect(defaultPortalPath(['client'], 0)).toBe('/client')
    expect(defaultPortalPath(['lawyer'], 0)).toBe('/lawyer')
    expect(defaultPortalPath(['lawyer', 'firm_owner'], 1)).toBe('/firm')
    expect(defaultPortalPath(['support'], 0)).toBe('/admin')
    expect(portalForPath('/ar/lawyer/appointments')).toBe('lawyer')
    expect(portalForPath('/en/lawyers')).toBeNull()
    expect(portalForPath('/admin')).toBe('admin')
    expect(canAccessPortal('admin', ['client'], 0)).toBe(false)
    expect(canAccessPortal('firm', ['firm_staff'], 1)).toBe(true)
    expect(canAccessPortal('firm', ['lawyer'], 0)).toBe(false)
  })
  it('applies least privilege to platform roles', () => {
    expect(hasPlatformPermission(['support'], 'support.tickets')).toBe(true)
    expect(hasPlatformPermission(['support'], 'payments.refund')).toBe(false)
    expect(hasPlatformPermission(['admin'], 'payments.refund')).toBe(true)
    expect(canEditSetting(['admin'], 'booking')).toBe(true)
    expect(canEditSetting(['admin'], 'integrations')).toBe(false)
    expect(canEditSetting(['super_admin'], 'integrations')).toBe(true)
  })
})

describe('reviews', () => {
  it('flags confidential content', () => {
    expect(reviewFlags('محامي ممتاز وشرحه واضح')).toEqual([])
    expect(reviewFlags('كلمني على 01012345678')).toContain('phone_or_id')
    expect(reviewFlags('mail me a@b.com')).toContain('email')
    expect(reviewFlags('بخصوص دعوى رقم 4521 لسنة 2025')).toContain('case_number')
    expect(reviewFlags('see www.example.com')).toContain('link')
  })
  it('smooths ratings toward the prior', () => {
    expect(smoothedRating(5, 1)).toBeCloseTo(4.1667, 3)
    expect(smoothedRating(4.8, 100)).toBeGreaterThan(smoothedRating(5, 1))
  })
})

describe('invoices', () => {
  it('computes totals with tax', () => {
    expect(invoiceTotals([{ description: 'x', quantity: 2, unit_minor: 10000 }], 1400)).toEqual({ subtotalMinor: 20000, taxMinor: 2800, totalMinor: 22800 })
    expect(() => invoiceTotals([{ description: 'x', quantity: 0, unit_minor: 1 }])).toThrow()
  })
})
