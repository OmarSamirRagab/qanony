import 'server-only'
import { requirePortal, type UserContext } from '@/lib/auth'
import { hasPlatformPermission, type PlatformPermission } from '@/lib/domain/permissions'

/**
 * Page-level permission check for the admin portal. Returns the context when
 * allowed, otherwise null so the page renders an access-denied state. The
 * database enforces the same rules independently through RLS and RPC checks.
 */
export async function adminAccess(permission?: PlatformPermission): Promise<UserContext | null> {
  const ctx = await requirePortal('admin')
  if (permission && !hasPlatformPermission(ctx.roles, permission)) return null
  return ctx
}
