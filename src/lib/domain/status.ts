/**
 * Status machines. These mirror app.*_transition_allowed() in the database,
 * which is authoritative; the UI uses them to decide which actions to offer.
 */
import type { Enums } from '@/types/database'

export type AppointmentStatus = Enums<'appointment_status'>
export type ServiceOrderStatus = Enums<'service_order_status'>
export type MatterStatus = Enums<'matter_status'>

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING_PAYMENT: ['PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  NO_SHOW: ['DISPUTED', 'REFUNDED'],
  CANCELLED: ['REFUNDED'],
  EXPIRED: ['REFUNDED', 'PENDING_CONFIRMATION', 'CONFIRMED'],
  DISPUTED: ['COMPLETED', 'REFUNDED', 'CANCELLED'],
  REFUNDED: [],
}

export const SERVICE_ORDER_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  CREATED: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['WAITING_FOR_CLIENT', 'DELIVERED', 'CANCELLED', 'DISPUTED'],
  WAITING_FOR_CLIENT: ['IN_PROGRESS', 'CANCELLED'],
  DELIVERED: ['COMPLETED', 'REVISION_REQUESTED', 'DISPUTED'],
  REVISION_REQUESTED: ['IN_PROGRESS', 'DELIVERED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: ['REFUNDED'],
  DISPUTED: ['COMPLETED', 'REFUNDED', 'CANCELLED', 'IN_PROGRESS'],
  REFUNDED: [],
}

export const MATTER_TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  NEW: ['UNDER_REVIEW', 'ACTIVE', 'CLOSED'],
  UNDER_REVIEW: ['ACTIVE', 'ON_HOLD', 'CLOSED'],
  ACTIVE: ['WAITING_FOR_CLIENT', 'WAITING_FOR_EXTERNAL_PARTY', 'ON_HOLD', 'COMPLETED', 'CLOSED'],
  WAITING_FOR_CLIENT: ['ACTIVE', 'ON_HOLD', 'CLOSED'],
  WAITING_FOR_EXTERNAL_PARTY: ['ACTIVE', 'ON_HOLD', 'CLOSED'],
  ON_HOLD: ['ACTIVE', 'CLOSED'],
  COMPLETED: ['CLOSED', 'ACTIVE'],
  CLOSED: ['ARCHIVED', 'ACTIVE'],
  ARCHIVED: [],
}

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return map[from]?.includes(to) ?? false
}

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS']
export const OPEN_MATTER_STATUSES: MatterStatus[] = ['NEW', 'UNDER_REVIEW', 'ACTIVE', 'WAITING_FOR_CLIENT', 'WAITING_FOR_EXTERNAL_PARTY', 'ON_HOLD']

export type AppointmentActor = 'client' | 'lawyer' | 'admin'

export interface AppointmentActionContext {
  status: AppointmentStatus
  startsAt: Date
  endsAt: Date
  occupiesSlot: boolean
  now?: Date
}

/** Actions an actor may take right now (mirrors public.transition_appointment()). */
export function availableAppointmentActions(actor: AppointmentActor, ctx: AppointmentActionContext): AppointmentStatus[] {
  const now = (ctx.now ?? new Date()).getTime()
  const start = ctx.startsAt.getTime()
  const end = ctx.endsAt.getTime()
  return APPOINTMENT_TRANSITIONS[ctx.status].filter((to) => {
    if (actor === 'admin') return to !== 'REFUNDED' && to !== 'DISPUTED'
    if (actor === 'client') return to === 'CANCELLED' && ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(ctx.status)
    switch (to) {
      case 'CONFIRMED':
        return ctx.status === 'PENDING_CONFIRMATION' && start > now
      case 'CANCELLED':
        return ['PENDING_CONFIRMATION', 'CONFIRMED'].includes(ctx.status)
      case 'IN_PROGRESS':
        return ctx.status === 'CONFIRMED' && ctx.occupiesSlot && now >= start - 15 * 60_000 && now <= end + 2 * 3_600_000
      case 'COMPLETED':
        return ctx.status === 'IN_PROGRESS' || (ctx.status === 'CONFIRMED' && (!ctx.occupiesSlot || now >= start))
      case 'NO_SHOW':
        return ctx.status === 'CONFIRMED' && ctx.occupiesSlot && now >= start + 15 * 60_000
      default:
        return false
    }
  })
}

/** Whether a participant may join the meeting room now (10 min before → 30 min after end). */
export function canJoinMeeting(status: AppointmentStatus, startsAt: Date, endsAt: Date, now = new Date()): boolean {
  if (status !== 'CONFIRMED' && status !== 'IN_PROGRESS') return false
  return now.getTime() >= startsAt.getTime() - 10 * 60_000 && now.getTime() <= endsAt.getTime() + 30 * 60_000
}
