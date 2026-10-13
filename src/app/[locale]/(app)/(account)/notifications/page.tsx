import { Bell } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { MarkAllReadButton } from '@/features/notifications/mark-all-read'
import { Link } from '@/i18n/navigation'
import { requireUser } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('dashboard.notifications')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data, count } = await supabase
    .from('notifications')
    .select('id, title, body, link, read_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * 30, page * 30 - 1)
  return (
    <>
      <PageHeader title={t('title')} actions={<MarkAllReadButton label={t('markAll')} />} />
      {data?.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {data.map((n) => {
            const inner = (
              <div className={cn('flex gap-3 p-4', !n.read_at && 'bg-gold-soft/40')}>
                <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-gold')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-muted-foreground">{n.body}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at, locale)}</div>
                </div>
              </div>
            )
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-muted/50">{inner}</Link> : inner}</li>
          })}
        </ul>
      ) : (
        <EmptyState icon={Bell} title={t('empty')} />
      )}
      <Pagination page={page} pageSize={30} total={count ?? 0} basePath="/notifications" searchParams={sp} />
    </>
  )
}
