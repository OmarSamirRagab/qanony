import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { requirePortal, type FirmMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const FIRM_COOKIE = 'qanony_firm'

/**
 * Active firm for the firm portal: the cookie value if it names a firm the
 * user is an active member of, otherwise their first membership. Tenant
 * isolation itself is enforced by RLS; this only picks the workspace.
 */
export const getFirmContext = cache(async () => {
  const ctx = await requirePortal('firm')
  const wanted = (await cookies()).get(FIRM_COOKIE)?.value
  const firm: FirmMembership = ctx.firms.find((f) => f.firm_id === wanted) ?? ctx.firms[0]!
  const supabase = await createClient()
  const { data: perms } = await supabase.rpc('my_firm_permissions', { p_firm_id: firm.firm_id })
  const permissions = new Set(perms ?? [])
  return { ctx, firm, permissions, can: (p: string) => permissions.has(p) }
})
