import { CalendarDays } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { DateRangeFilter, parseRange } from '@/components/shared/date-range'
import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { Link } from '@/i18n/navigation'
import { addDaysIso, cairoDate, formatTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

/** Shared agenda of the firm's lawyers, grouped by Cairo date. */
export default async function FirmCalendarPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { firm, can } = await getFirmContext()
  if (!can('appointments.manage')) return <FirmDenied />
  const sp = await searchParams
  const today = cairoDate()
  const range = parseRange({ from: sp.from ?? today, to: sp.to ?? addDaysIso(today, 14) })
  const t = await getTranslations('firm.calendar')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase
    .from('appointments')
    .select('id, starts_at, status, consultation_type, lawyer:lawyer_profiles(display_name_ar, display_name_en), client:profiles!appointments_client_id_fkey(full_name)')
    .eq('firm_id', firm.firm_id)
    .in('status', ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])
    .gte('starts_at', `${range.from}T00:00:00Z`)
    .lte('starts_at', `${range.to}T23:59:59Z`)
    .order('starts_at')
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' })
  const groups = new Map<string, NonNullable<typeof data>>()
  for (const a of data ?? []) {
    const k = dayKey.format(new Date(a.starts_at))
    groups.set(k, [...(groups.get(k) ?? []), a])
  }
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <DateRangeFilter basePath="/firm/calendar" from={range.from} to={range.to} />
      {groups.size ? (
        <div className="space-y-5">
          {[...groups.entries()].map(([k, list]) => (
            <section key={k} className="rounded-xl border bg-card shadow-soft">
              <h2 className="border-b px-4 py-2.5 text-sm font-bold">{dayLabel.format(new Date(list[0]!.starts_at))}</h2>
              <ul className="divide-y">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link href={`/firm/appointments/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                      <span className="w-16 font-bold tabular-nums">{formatTime(a.starts_at, locale)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{a.lawyer ? pick(locale, a.lawyer.display_name_ar, a.lawyer.display_name_en) : ''}</span>
                        <span className="text-muted-foreground"> · {a.client?.full_name} · {te(`consultation.${a.consultation_type}`)}</span>
                      </span>
                      <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarDays} title={t('empty')} />
      )}
    </>
  )
}
