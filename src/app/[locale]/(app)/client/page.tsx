import { CalendarClock, CreditCard, FileStack, FolderKanban, Gavel, MessagesSquare, Search } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatCard } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { AppointmentList } from '@/features/booking/components/appointment-list'
import { listAppointments } from '@/features/booking/queries'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { formatDate, formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function ClientOverview() {
  const ctx = await requirePortal('client')
  const t = await getTranslations('dashboard')
  const locale = await getLocale()
  const supabase = await createClient()
  const now = new Date().toISOString()
  const [upcoming, matters, pendingPay, unread, hearings, docs, profile] = await Promise.all([
    listAppointments({ as: 'client', tab: 'upcoming' }),
    supabase.from('legal_matters').select('id', { count: 'exact', head: true }).eq('client_user_id', ctx.userId).not('status', 'in', '(CLOSED,ARCHIVED,COMPLETED)'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('client_id', ctx.userId).eq('status', 'PENDING_PAYMENT').gt('hold_expires_at', now),
    supabase.rpc('get_unread_counts'),
    supabase.from('matter_hearings').select('id, court_name, hearing_at, matter_id, matter:legal_matters!inner(reference, title, client_user_id)').eq('matter.client_user_id', ctx.userId).gte('hearing_at', now).order('hearing_at').limit(5),
    supabase.from('documents').select('id, title, created_at').eq('owner_id', ctx.userId).eq('status', 'active').order('created_at', { ascending: false }).limit(5),
    supabase.from('profiles').select('phone').eq('id', ctx.userId).single(),
  ])
  const unreadTotal = (unread.data ?? []).reduce((s, r) => s + Number(r.unread), 0)

  return (
    <>
      <PageHeader
        title={t('greeting', { name: ctx.fullName.split(' ')[0] ?? '' })}
        description={t('client.overviewSubtitle')}
        actions={
          <Button asChild variant="gold">
            <Link href="/lawyers">
              <Search aria-hidden /> {t('client.bookNow')}
            </Link>
          </Button>
        }
      />
      {!profile.data?.phone ? (
        <Notice tone="info" className="mb-6" title={t('client.completeProfile')}>
          <Link href="/client/settings" className="font-semibold underline">
            {t('settings.title')}
          </Link>
        </Notice>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('client.upcoming')} value={upcoming.total} icon={CalendarClock} tone="gold" href="/client/appointments" />
        <StatCard label={t('client.activeMatters')} value={matters.count ?? 0} icon={FolderKanban} href="/client/matters" />
        <StatCard label={t('client.pendingPayments')} value={pendingPay.count ?? 0} icon={CreditCard} tone="warning" href="/client/appointments?tab=pending" />
        <StatCard label={t('client.unreadMessages')} value={unreadTotal} icon={MessagesSquare} tone="info" href="/client/messages" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title={t('client.upcoming')} action={<Link href="/client/appointments" className="text-sm font-semibold text-gold">{t('appointments.tabAll')}</Link>}>
          {upcoming.rows.length ? (
            <AppointmentList rows={upcoming.rows.slice(0, 5)} as="client" basePath="/client/appointments" />
          ) : (
            <EmptyState
              icon={CalendarClock}
              title={t('client.noUpcoming')}
              action={
                <Button asChild variant="gold">
                  <Link href="/lawyers">{t('client.bookNow')}</Link>
                </Button>
              }
            />
          )}
        </Section>
        <div className="space-y-6">
          <Section title={t('client.deadlines')}>
            {hearings.data?.length ? (
              <ul className="space-y-3">
                {hearings.data.map((h) => (
                  <li key={h.id}>
                    <Link href={`/client/matters/${h.matter_id}`} className="flex gap-3 rounded-lg p-1 hover:bg-muted">
                      <Gavel className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                      <div>
                        <div className="text-sm font-semibold">{h.court_name}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(h.hearing_at, locale)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('client.noDeadlines')}</p>
            )}
          </Section>
          <Section title={t('client.recentDocuments')}>
            {docs.data?.length ? (
              <ul className="space-y-2">
                {docs.data.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <FileStack className="size-4 shrink-0 text-gold" aria-hidden />
                      <span className="truncate">{d.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(d.created_at, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('client.noDocuments')}</p>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
