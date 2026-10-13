import { CalendarCheck, CalendarClock, CheckCircle2, Circle, Clock, FolderKanban, MessagesSquare, ShoppingBag, Star, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatCard, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/primitives'
import { AppointmentList } from '@/features/booking/components/appointment-list'
import { listAppointments } from '@/features/booking/queries'
import { PublishToggle } from '@/features/lawyer-portal/components/publish-toggle'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { addDaysIso, cairoDate, formatTime } from '@/lib/format'
import { fromZonedTime } from 'date-fns-tz'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export default async function LawyerOverview() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const today = cairoDate()
  const [{ data: stats }, { data: lawyer }, specs, offers, windows, pending, todays] = await Promise.all([
    supabase.rpc('lawyer_dashboard_stats'),
    supabase.from('lawyer_profiles').select('slug, bio_ar, title_ar, verification_status, is_published, timezone').eq('id', ctx.userId).single(),
    supabase.from('lawyer_specializations').select('category_id', { count: 'exact', head: true }).eq('lawyer_id', ctx.userId),
    supabase.from('lawyer_consultation_offerings').select('lawyer_id', { count: 'exact', head: true }).eq('lawyer_id', ctx.userId).eq('is_active', true),
    supabase.from('lawyer_availability').select('id', { count: 'exact', head: true }).eq('lawyer_id', ctx.userId),
    listAppointments({ as: 'lawyer', tab: 'pending' }),
    supabase
      .from('appointments')
      .select('id, starts_at, status, consultation_type, client:profiles!appointments_client_id_fkey(full_name)')
      .eq('lawyer_id', ctx.userId)
      .in('status', ['CONFIRMED', 'IN_PROGRESS', 'PENDING_CONFIRMATION'])
      .gte('starts_at', fromZonedTime(`${today}T00:00:00`, 'Africa/Cairo').toISOString())
      .lt('starts_at', fromZonedTime(`${addDaysIso(today, 1)}T00:00:00`, 'Africa/Cairo').toISOString())
      .order('starts_at'),
  ])
  const s = (stats ?? {}) as Record<string, number>
  const steps = [
    { done: Boolean(lawyer?.bio_ar && lawyer.title_ar), label: t('lawyer.setupProfile'), href: '/lawyer/profile' },
    { done: (specs.count ?? 0) > 0, label: t('lawyer.setupSpecializations'), href: '/lawyer/profile#specializations' },
    { done: (offers.count ?? 0) > 0, label: t('lawyer.setupOfferings'), href: '/lawyer/profile#offerings' },
    { done: (windows.count ?? 0) > 0, label: t('lawyer.setupAvailability'), href: '/lawyer/availability' },
    { done: lawyer?.verification_status === 'verified' || lawyer?.verification_status === 'pending', label: t('lawyer.setupVerification'), href: '/lawyer/verification' },
    { done: Boolean(lawyer?.is_published), label: t('lawyer.setupPublish'), href: '/lawyer' },
  ]
  const doneCount = steps.filter((x) => x.done).length

  return (
    <>
      <PageHeader
        title={t('greeting', { name: ctx.fullName.split(' ')[0] ?? '' })}
        description={t('lawyer.overviewSubtitle')}
        actions={
          <>
            <StatusBadge status={lawyer?.verification_status ?? 'unverified'} label={te(`verification.${lawyer?.verification_status ?? 'unverified'}`)} />
            <PublishToggle published={Boolean(lawyer?.is_published)} verified={lawyer?.verification_status === 'verified'} />
            {ctx.firms.length === 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/create-firm">{(await getTranslations('firm.create'))('cta')}</Link>
              </Button>
            ) : null}
            {lawyer?.is_published ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/lawyers/${lawyer.slug}`}>{(await getTranslations('nav.lawyer'))('viewPublicProfile')}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {doneCount < steps.length ? (
        <Section title={t('lawyer.setupTitle')} className="mb-6">
          <Progress value={(doneCount / steps.length) * 100} className="mb-4" />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step) => (
              <li key={step.label}>
                <Link href={step.href} className={cn('flex items-center gap-2 rounded-lg border p-3 text-sm hover:border-gold/50', step.done && 'text-muted-foreground line-through')}>
                  {step.done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-gold" aria-hidden />}
                  {step.label}
                </Link>
              </li>
            ))}
          </ul>
          {lawyer?.verification_status !== 'verified' ? <Notice tone="info" className="mt-4" title={t('lawyer.publishRequiresVerification')} /> : null}
        </Section>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('lawyer.today')} value={s.today ?? 0} icon={CalendarClock} tone="gold" href="/lawyer/appointments" />
        <StatCard label={t('lawyer.pending')} value={s.pending_requests ?? 0} icon={Clock} tone="warning" href="/lawyer/appointments?tab=pending" />
        <StatCard label={t('lawyer.revenue')} value={formatMoney(s.revenue_month_minor ?? 0, locale)} icon={Wallet} tone="success" href="/lawyer/finance" />
        <StatCard label={t('lawyer.unread')} value={s.unread_messages ?? 0} icon={MessagesSquare} tone="info" href="/lawyer/messages" />
        <StatCard label={t('lawyer.upcoming')} value={s.upcoming ?? 0} icon={CalendarCheck} />
        <StatCard label={t('lawyer.activeMatters')} value={s.active_matters ?? 0} icon={FolderKanban} href="/lawyer/matters" />
        <StatCard label={t('lawyer.openOrders')} value={s.open_orders ?? 0} icon={ShoppingBag} href="/lawyer/orders" />
        <StatCard label={t('lawyer.satisfaction')} value={s.rating_count ? `${Number(s.rating_avg).toFixed(1)} / 5` : '—'} hint={s.rating_count ? `${s.rating_count}` : undefined} icon={Star} href="/lawyer/reviews" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Section title={t('lawyer.schedule')}>
          {todays.data?.length ? (
            <ul className="space-y-2">
              {todays.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/lawyer/appointments/${a.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:border-gold/50">
                    <span className="w-16 font-bold tabular-nums">{formatTime(a.starts_at, locale, lawyer?.timezone)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.client?.full_name}</span>
                      <span className="text-xs text-muted-foreground">{te(`consultation.${a.consultation_type}`)}</span>
                    </span>
                    <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('lawyer.noToday')}</p>
          )}
        </Section>
        <Section title={t('lawyer.pendingRequests')}>
          <AppointmentList rows={pending.rows.slice(0, 6)} as="lawyer" basePath="/lawyer/appointments" />
        </Section>
      </div>
    </>
  )
}
