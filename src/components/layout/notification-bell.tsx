'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlay'
import { Link } from '@/i18n/navigation'
import { formatRelative } from '@/lib/format'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Row {
  id: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export function NotificationBell({ userId, onDark = true }: { userId: string; onDark?: boolean }) {
  const t = useTranslations('nav.account')
  const locale = useLocale()
  const qc = useQueryClient()
  const key = ['notifications', userId]

  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await getBrowserClient()
        .from('notifications')
        .select('id, title, body, link, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(12)
      if (error) throw error
      return data as Row[]
    },
  })

  // RLS restricts realtime rows to the current user; the filter narrows the stream.
  useEffect(() => {
    const supabase = getBrowserClient()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications', userId] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, userId])

  const unread = data.filter((n) => !n.read_at).length

  async function markAll() {
    await getBrowserClient().rpc('mark_notifications_read', {})
    void qc.invalidateQueries({ queryKey: key })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={onDark ? 'onDark' : 'ghost'} size="icon-sm" className="relative" aria-label={`${t('notifications')}${unread ? ` (${unread})` : ''}`}>
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] leading-4 font-bold text-gold-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-bold">{t('notifications')}</div>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck aria-hidden /> {t('markAllRead')}
            </Button>
          ) : null}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {data.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('noNotifications')}</li> : null}
          {data.map((n) => {
            const inner = (
              <div className={cn('flex gap-3 px-4 py-3 transition-colors hover:bg-muted', !n.read_at && 'bg-gold-soft/40')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-gold')} aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{formatRelative(n.created_at, locale)}</div>
                </div>
              </div>
            )
            return <li key={n.id} className="border-b last:border-0">{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>
          })}
        </ul>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications">{t('viewAllNotifications')}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
