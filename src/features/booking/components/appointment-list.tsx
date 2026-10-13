import { CalendarClock, MapPin, MessageSquareText, Phone, Video } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, StatusBadge } from '@/components/shared'
import { Avatar } from '@/components/ui/primitives'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { formatDateTime } from '@/lib/format'
import { cn, pick } from '@/lib/utils'
import type { AppointmentListRow, AppointmentTab } from '../queries'

const TYPE_ICON = { video: Video, voice: Phone, text: MessageSquareText, in_person: MapPin, written_opinion: CalendarClock } as const

export async function AppointmentTabs({ basePath, current, extraQuery = '' }: { basePath: string; current: AppointmentTab; extraQuery?: string }) {
  const t = await getTranslations('dashboard.appointments')
  const tabs: { key: AppointmentTab; label: string }[] = [
    { key: 'upcoming', label: t('tabUpcoming') },
    { key: 'pending', label: t('tabPending') },
    { key: 'past', label: t('tabPast') },
    { key: 'all', label: t('tabAll') },
  ]
  return (
    <div className="mb-5 inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}?tab=${tab.key}${extraQuery}`}
          role="tab"
          aria-selected={current === tab.key}
          className={cn('rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground', current === tab.key && 'bg-card text-foreground shadow-sm')}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

export async function AppointmentList({ rows, as, basePath }: { rows: AppointmentListRow[]; as: 'client' | 'lawyer'; basePath: string }) {
  const t = await getTranslations('dashboard.appointments')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  if (!rows.length) return <EmptyState icon={CalendarClock} title={t('empty')} />
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
      {rows.map((a) => {
        const Icon = TYPE_ICON[a.consultation_type]
        const counterpart = as === 'client' ? (a.lawyer ? pick(locale, a.lawyer.display_name_ar, a.lawyer.display_name_en) : '') : (a.client?.full_name ?? '')
        return (
          <li key={a.id}>
            <Link href={`${basePath}/${a.id}`} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={as === 'client' ? a.lawyer?.photo_url : a.client?.avatar_url} name={counterpart} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{counterpart}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Icon className="size-3.5" aria-hidden /> {te(`consultation.${a.consultation_type}`)}
                    </span>
                    <span className="font-mono">{a.reference}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="text-sm sm:text-end">
                  <div className="font-semibold">{a.occupies_slot ? formatDateTime(a.starts_at, locale, a.lawyer?.timezone) : t('writtenDue', { date: formatDateTime(a.ends_at, locale) })}</div>
                  <div className="text-xs text-muted-foreground">{a.price_minor === 0 ? tc('free') : formatMoney(a.price_minor, locale)}</div>
                </div>
                <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
