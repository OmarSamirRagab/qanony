'use client'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { portalsFor, type AppRole } from '@/lib/domain/permissions'
import { isSupabaseConfigured } from '@/lib/env'
import { getBrowserClient } from '@/lib/supabase/client'
import { NotificationBell } from './notification-bell'
import { UserMenu } from './user-menu'

interface Ctx {
  user_id: string
  full_name: string
  roles: AppRole[]
  firms: unknown[]
}

/**
 * Session-dependent part of the public header, resolved on the client so that
 * public pages remain statically cacheable.
 */
export function HeaderAccount() {
  const t = useTranslations('nav.public')
  const { data, refetch, isPending } = useQuery({
    queryKey: ['session-context'],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const supabase = getBrowserClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return null
      const { data } = await supabase.rpc('my_context')
      return data ? { ctx: data as unknown as Ctx, email: auth.user.email ?? null } : null
    },
  })

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const { data: sub } = getBrowserClient().auth.onAuthStateChange(() => void refetch())
    return () => sub.subscription.unsubscribe()
  }, [refetch])

  if (isSupabaseConfigured && isPending) return <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" aria-hidden />

  if (!data) {
    return (
      <>
        <Button asChild variant="onDark" size="sm" className="hidden sm:inline-flex">
          <Link href="/login">{t('login')}</Link>
        </Button>
        <Button asChild variant="gold" size="sm">
          <Link href="/register">{t('register')}</Link>
        </Button>
      </>
    )
  }
  const portals = portalsFor(data.ctx.roles, data.ctx.firms.length)
  return (
    <>
      <NotificationBell userId={data.ctx.user_id} />
      <Button asChild variant="gold" size="sm" className="hidden sm:inline-flex">
        <Link href="/dashboard">{t('dashboard')}</Link>
      </Button>
      <UserMenu name={data.ctx.full_name} email={data.email} portals={portals} settingsHref={portals.includes('lawyer') ? '/lawyer/settings' : '/client/settings'} />
    </>
  )
}
