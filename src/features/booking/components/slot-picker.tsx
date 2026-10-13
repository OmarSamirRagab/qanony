'use client'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addDaysIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Enums } from '@/types/database'
import { fetchSlots } from '../actions'

/** Compact 7-day slot picker backed by the authoritative get_available_slots RPC. */
export function SlotPicker({
  lawyerId,
  type,
  timezone,
  today,
  value,
  onChange,
}: {
  lawyerId: string
  type: Enums<'consultation_kind'>
  timezone: string
  today: string
  value: string | null
  onChange: (v: string) => void
}) {
  const t = useTranslations('booking')
  const locale = useLocale()
  const [from, setFrom] = useState(today)
  const to = addDaysIso(from, 6)
  const { data = [], isLoading } = useQuery({ queryKey: ['slots', lawyerId, type, from], queryFn: () => fetchSlots(lawyerId, type, from, to) })
  const fmtDay = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone })
  const fmtTime = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: timezone })
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const groups = new Map<string, typeof data>()
  for (const s of data) {
    const k = keyFmt.format(new Date(s.starts_at))
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" disabled={from <= today} onClick={() => setFrom(addDaysIso(from, -7))}>
          <ChevronRight className="ltr:rotate-180" aria-hidden /> {t('prevWeek')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('timezoneNote')}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setFrom(addDaysIso(from, 7))}>
          {t('nextWeek')} <ChevronLeft className="ltr:rotate-180" aria-hidden />
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-gold" aria-label={t('loadingSlots')} />
        </div>
      ) : groups.size === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('noSlots')}</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {[...groups.entries()].map(([day, slots]) => (
            <div key={day}>
              <div className="mb-1.5 text-xs font-bold text-muted-foreground">{fmtDay.format(new Date(slots[0]!.starts_at))}</div>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    onClick={() => onChange(s.starts_at)}
                    aria-pressed={value === s.starts_at}
                    className={cn('cursor-pointer rounded-lg border px-2.5 py-1 text-sm font-semibold tabular-nums hover:border-gold', value === s.starts_at && 'border-gold bg-gold text-gold-foreground')}
                  >
                    {fmtTime.format(new Date(s.starts_at))}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
