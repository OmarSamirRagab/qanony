/**
 * Role/permission helpers for UI routing and server-side pre-checks.
 * Data access is always enforced by RLS and security-definer RPCs; these helpers
 * only decide what to render and fail fast before a round-trip.
 */
import type { Enums } from '@/types/database'

export type AppRole = Enums<'app_role'>
export type Portal = 'client' | 'lawyer' | 'firm' | 'admin'

export const FIRM_PERMISSIONS = [
  'matters.view',
  'matters.edit',
  'matters.assign',
  'documents.view',
  'documents.upload',
  'invoices.view',
  'invoices.manage',
  'clients.manage',
  'appointments.manage',
  'reports.financial',
  'members.manage',
  'firm.settings',
] as const
export type FirmPermission = (typeof FIRM_PERMISSIONS)[number]

export const PLATFORM_PERMISSIONS = [
  'users.view',
  'users.manage',
  'verification.review',
  'firms.manage',
  'appointments.view',
  'services.moderate',
  'payments.view',
  'payments.refund',
  'settlements.manage',
  'subscriptions.manage',
  'disputes.manage',
  'reviews.moderate',
  'content.manage',
  'settings.manage',
  'audit.view',
  'support.tickets',
  'reports.view',
] as const
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]

const SUPPORT_PERMISSIONS: PlatformPermission[] = ['users.view', 'appointments.view', 'support.tickets']

export function platformPermissions(roles: readonly AppRole[]): Set<PlatformPermission> {
  if (roles.includes('super_admin') || roles.includes('admin')) return new Set(PLATFORM_PERMISSIONS)
  if (roles.includes('support')) return new Set(SUPPORT_PERMISSIONS)
  return new Set()
}

export function hasPlatformPermission(roles: readonly AppRole[], permission: PlatformPermission): boolean {
  return platformPermissions(roles).has(permission)
}

export function isPlatformStaff(roles: readonly AppRole[]): boolean {
  return roles.some((r) => r === 'support' || r === 'admin' || r === 'super_admin')
}

export function isAdmin(roles: readonly AppRole[]): boolean {
  return roles.includes('admin') || roles.includes('super_admin')
}

/** Settings keys only super admins may change (mirrors the platform_settings policy). */
export const SUPER_ADMIN_SETTINGS = new Set(['integrations', 'security'])

export function canEditSetting(roles: readonly AppRole[], key: string): boolean {
  if (roles.includes('super_admin')) return true
  return roles.includes('admin') && !SUPER_ADMIN_SETTINGS.has(key)
}

/** Portals available to a user, in priority order for the default landing page. */
export function portalsFor(roles: readonly AppRole[], firmCount: number): Portal[] {
  const portals: Portal[] = []
  if (isPlatformStaff(roles)) portals.push('admin')
  if (firmCount > 0) portals.push('firm')
  if (roles.includes('lawyer')) portals.push('lawyer')
  if (roles.includes('client')) portals.push('client')
  return portals
}

export function defaultPortalPath(roles: readonly AppRole[], firmCount: number): string {
  const first = portalsFor(roles, firmCount)[0]
  switch (first) {
    case 'admin':
      return '/admin'
    case 'firm':
      return '/firm'
    case 'lawyer':
      return '/lawyer'
    default:
      return '/client'
  }
}

/** Which portal a pathname belongs to, used by the proxy for coarse gating. */
export function portalForPath(pathname: string): Portal | null {
  const seg = pathname.replace(/^\/(ar|en)(?=\/|$)/, '').split('/')[1]
  if (seg === 'client' || seg === 'lawyer' || seg === 'firm' || seg === 'admin') return seg
  return null
}

export function canAccessPortal(portal: Portal, roles: readonly AppRole[], firmCount: number): boolean {
  switch (portal) {
    case 'admin':
      return isPlatformStaff(roles)
    case 'firm':
      return firmCount > 0
    case 'lawyer':
      return roles.includes('lawyer')
    case 'client':
      return roles.includes('client')
  }
}
