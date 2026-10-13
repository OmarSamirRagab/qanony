/**
 * Subscription entitlements. The database enforces limits (bookings, matters,
 * services, seats, branches); server actions call these helpers for features
 * that are gated in application code (analytics, templates, AI tools, …).
 */
export type FeatureKey =
  | 'bookings.monthly'
  | 'services.listings'
  | 'matters.active'
  | 'calendar.advanced'
  | 'calendar.shared'
  | 'analytics'
  | 'analytics.advanced'
  | 'templates'
  | 'profile.enhanced'
  | 'ai.tools'
  | 'firm.lawyers'
  | 'firm.staff'
  | 'firm.branches'
  | 'firm.financial_reports'
  | 'firm.custom_permissions'
  | 'integrations'
  | 'support.dedicated'

export interface Entitlements {
  plan: { code: string; name_ar: string; name_en: string } | null
  features: Partial<Record<string, { enabled: boolean; limit: number | null }>>
}

export function hasFeature(ent: Entitlements | null | undefined, key: FeatureKey): boolean {
  return ent?.features[key]?.enabled === true
}

export function featureLimit(ent: Entitlements | null | undefined, key: FeatureKey): number | null | undefined {
  const f = ent?.features[key]
  if (!f?.enabled) return 0
  return f.limit
}

/** True when `used` more items are still within the plan's limit for `key`. */
export function withinLimit(ent: Entitlements | null | undefined, key: FeatureKey, used: number): boolean {
  const limit = featureLimit(ent, key)
  if (limit === 0) return false
  if (limit == null) return true
  return used < limit
}

export class EntitlementError extends Error {
  constructor(public readonly feature: FeatureKey) {
    super(`Feature not included in plan: ${feature}`)
    this.name = 'EntitlementError'
  }
}

export function requireFeature(ent: Entitlements | null | undefined, key: FeatureKey): void {
  if (!hasFeature(ent, key)) throw new EntitlementError(key)
}
