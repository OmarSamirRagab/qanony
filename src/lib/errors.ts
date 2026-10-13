/**
 * Maps database / auth errors to translatable keys in messages/<locale>/errors.json.
 * Security-definer RPCs raise with HINTs (e.g. 'slot_unavailable') for
 * machine-readable reasons; SQLSTATE codes cover the rest.
 */
export type ErrorKey =
  | 'unknown'
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'slotUnavailable'
  | 'holdExpired'
  | 'planLimit'
  | 'subscriptionRequired'
  | 'deadlinePassed'
  | 'rescheduleLimit'
  | 'invalidTransition'
  | 'actionUnavailable'
  | 'insufficientBalance'
  | 'belowMinimum'
  | 'noSettlementAccount'
  | 'infected'
  | 'invalidFile'
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'userExists'
  | 'accountInactive'
  | 'notConfigured'
  | 'providerUnavailable'
  | 'required'

const HINTS: Record<string, ErrorKey> = {
  slot_unavailable: 'slotUnavailable',
  hold_expired: 'holdExpired',
  plan_limit: 'planLimit',
  subscription_required: 'subscriptionRequired',
  rate_limited: 'rateLimited',
  deadline_passed: 'deadlinePassed',
  reschedule_limit: 'rescheduleLimit',
  insufficient_balance: 'insufficientBalance',
  below_minimum: 'belowMinimum',
  no_account: 'noSettlementAccount',
  infected: 'infected',
  invalid_file: 'invalidFile',
}

export interface DbErrorLike {
  code?: string
  message?: string
  hint?: string | null
  details?: string | null
  status?: number
}

export function mapDbError(error: DbErrorLike | null | undefined): ErrorKey {
  if (!error) return 'unknown'
  if (error.hint && HINTS[error.hint]) return HINTS[error.hint]!
  const msg = error.message ?? ''
  if (/Invalid login credentials/i.test(msg)) return 'invalidCredentials'
  if (/Email not confirmed/i.test(msg)) return 'emailNotConfirmed'
  if (/already registered|already been registered|User already exists/i.test(msg)) return 'userExists'
  if (/not active/i.test(msg)) return 'accountInactive'
  if (/Invalid .* transition/i.test(msg)) return 'invalidTransition'
  if (/not available right now/i.test(msg)) return 'actionUnavailable'
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return 'unauthenticated'
    case '42501':
      return 'forbidden'
    case 'P0002':
    case 'PGRST116':
      return 'notFound'
    case '23505':
      return 'conflict'
    case '23P01':
      return 'slotUnavailable'
  }
  if (error.status === 429) return 'rateLimited'
  return 'unknown'
}

/** Human-readable detail for 22023 validation errors raised by RPCs (already user-facing English). */
export function dbErrorDetail(error: DbErrorLike | null | undefined): string | undefined {
  return error?.code === '22023' ? error.message : undefined
}
