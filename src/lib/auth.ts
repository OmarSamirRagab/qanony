import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { getLocale } from 'next-intl/server'
import { canAccessPortal, type AppRole, type Portal } from '@/lib/domain/permissions'
import { isSupabaseConfigured } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export interface FirmMembership {
  firm_id: string
  member_id: string
  name: string
  name_en: string | null
  member_type: 'owner' | 'lawyer' | 'staff'
  slug: string
}

export interface UserContext {
  userId: string
  email: string | null
  fullName: string
  locale: 'ar' | 'en'
  status: string
  roles: AppRole[]
  lawyer: { slug: string; verification_status: string; is_published: boolean; primary_firm_id: string | null } | null
  firms: FirmMembership[]
  pendingInvitations: number
}

/** Current user + role context, memoised per request. Null when signed out or unconfigured. */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  if (!isSupabaseConfigured) return null
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase.rpc('my_context')
  if (error || !data) return null
  const ctx = data as unknown as {
    user_id: string
    full_name: string
    locale: 'ar' | 'en'
    status: string
    roles: AppRole[]
    lawyer: UserContext['lawyer']
    firms: FirmMembership[]
    pending_invitations: number
  }
  return {
    userId: ctx.user_id,
    email: auth.user.email ?? null,
    fullName: ctx.full_name,
    locale: ctx.locale,
    status: ctx.status,
    roles: ctx.roles ?? [],
    lawyer: ctx.lawyer,
    firms: ctx.firms ?? [],
    pendingInvitations: ctx.pending_invitations ?? 0,
  }
})

async function localized(path: string) {
  const locale = await getLocale()
  return locale === 'ar' ? path : `/${locale}${path}`
}

export async function requireUser(next?: string): Promise<UserContext> {
  const ctx = await getUserContext()
  if (!ctx) redirect(await localized(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`))
  if (ctx.status !== 'active' && ctx.status !== 'pending_deletion') redirect(await localized('/login?error=inactive'))
  return ctx
}

export async function requirePortal(portal: Portal): Promise<UserContext> {
  const ctx = await requireUser(`/${portal}`)
  if (!canAccessPortal(portal, ctx.roles, ctx.firms.length)) redirect(await localized('/dashboard?denied=1'))
  return ctx
}

/** Resolve the active firm for the firm portal from ?firm= or the first membership. */
export function activeFirm(ctx: UserContext, firmId?: string | null): FirmMembership | null {
  if (firmId) return ctx.firms.find((f) => f.firm_id === firmId) ?? null
  return ctx.firms[0] ?? null
}
