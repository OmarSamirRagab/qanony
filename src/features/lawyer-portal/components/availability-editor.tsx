'use client'
import { Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'
import { findWindowProblems, generateSlots, groupSlotsByDay, type AvailabilityException, type WeeklyWindow } from '@/lib/domain/availability'
import { addDaysIso } from '@/lib/format'
import { addException, deleteException, saveBookingRules, saveWeeklyAvailability } from '../actions'

interface Rules {
  minNoticeHours: number
  maxAdvanceDays: number
  bufferMinutes: number
  maxDailyAppointments: number | null
  cancellationDeadlineHours: number
  autoConfirm: boolean
}

export function AvailabilityEditor({
  windows: initialWindows,
  exceptions,
  rules: initialRules,
  timezone,
  previewDuration,
  today,
  busy,
}: {
  windows: WeeklyWindow[]
  exceptions: (AvailabilityException & { id: string; reason: string | null })[]
  rules: Rules
  timezone: string
  previewDuration: number | null
  today: string
  busy: { startsAt: string; endsAt: string }[]
}) {
  const t = useTranslations('dashboard.availability')
  const tw = useTranslations('enums.weekday')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [windows, setWindows] = useState(initialWindows)
  const [rules, setRules] = useState(initialRules)
  const [ex, setEx] = useState({ date: today, kind: 'unavailable' as 'unavailable' | 'available', allDay: true, startTime: '10:00', endTime: '14:00', reason: '' })

  const run = (fn: () => Promise<ActionResult>, msg = t('saved')) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) return void toast.error(res.detail ?? te(res.error))
      toast.success(msg)
      router.refresh()
    })

  const problems = findWindowProblems(windows)
  const preview = useMemo(() => {
    if (!previewDuration || problems.length) return {}
    const slots = generateSlots({
      from: today,
      to: addDaysIso(today, 6),
      windows,
      exceptions,
      busy: busy.map((b) => ({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) })),
      rules: { timezone, durationMinutes: previewDuration, bufferMinutes: rules.bufferMinutes, minNoticeHours: rules.minNoticeHours, maxAdvanceDays: rules.maxAdvanceDays, maxDailyAppointments: rules.maxDailyAppointments },
    })
    return groupSlotsByDay(slots, timezone)
  }, [windows, exceptions, busy, rules, timezone, previewDuration, today, problems.length])
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: timezone })
  const fmtDay = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const card = 'rounded-xl border bg-card p-5 shadow-soft'

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className={card}>
          <h2 className="mb-4 font-bold">{t('weekly')}</h2>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const dayWindows = windows.map((w, i) => ({ w, i })).filter((x) => x.w.weekday === d)
              return (
                <div key={d} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-start">
                  <div className="w-24 shrink-0 pt-2 text-sm font-semibold">{tw(String(d) as '0')}</div>
                  <div className="flex-1 space-y-2">
                    {dayWindows.length === 0 ? <div className="pt-2 text-sm text-muted-foreground">{t('closed')}</div> : null}
                    {dayWindows.map(({ w, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" aria-label={t('from')} value={w.startTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} className="w-32" />
                        <span className="text-muted-foreground">–</span>
                        <Input type="time" aria-label={t('to')} value={w.endTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} className="w-32" />
                        <Button variant="ghost" size="icon-sm" aria-label={tc('remove')} onClick={() => setWindows(windows.filter((_, j) => j !== i))}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setWindows([...windows, { weekday: d, startTime: '10:00', endTime: '17:00' }])}>
                    <Plus aria-hidden /> {t('addWindow')}
                  </Button>
                </div>
              )
            })}
          </div>
          {problems.length ? <p className="mt-3 text-sm text-destructive">{problems.map((p) => t('overlap', { day: tw((p.split(':')[1] ?? '0') as '0') })).join(' · ')}</p> : null}
          <Button className="mt-4" loading={pending} disabled={problems.length > 0} onClick={() => run(() => saveWeeklyAvailability(windows))}>
            {tc('save')}
          </Button>
        </section>

        <section className={card}>
          <h2 className="mb-4 font-bold">{t('exceptions')}</h2>
          <ul className="mb-4 space-y-2">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <span>
                  <span className="font-semibold">{fmtDay.format(new Date(`${e.date}T00:00:00Z`))}</span> · {e.kind === 'unavailable' ? t('unavailable') : t('available')}{' '}
                  {e.startTime ? `${e.startTime.slice(0, 5)}–${e.endTime?.slice(0, 5)}` : `(${t('allDay')})`}
                  {e.reason ? <span className="text-muted-foreground"> · {e.reason}</span> : null}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={tc('remove')} onClick={() => run(() => deleteException(e.id))}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="ex-date" label={t('date')}>
              <Input id="ex-date" type="date" min={today} value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} />
            </FormField>
            <FormField id="ex-kind" label={t('kind')}>
              <NativeSelect id="ex-kind" value={ex.kind} onChange={(e) => setEx({ ...ex, kind: e.target.value as 'available', allDay: e.target.value === 'unavailable' ? ex.allDay : false })}>
                <option value="unavailable">{t('unavailable')}</option>
                <option value="available">{t('available')}</option>
              </NativeSelect>
            </FormField>
            {ex.kind === 'unavailable' ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch checked={ex.allDay} onCheckedChange={(v) => setEx({ ...ex, allDay: v })} /> {t('allDay')}
              </label>
            ) : null}
            {!ex.allDay || ex.kind === 'available' ? (
              <>
                <Input type="time" aria-label={t('from')} value={ex.startTime} onChange={(e) => setEx({ ...ex, startTime: e.target.value })} />
                <Input type="time" aria-label={t('to')} value={ex.endTime} onChange={(e) => setEx({ ...ex, endTime: e.target.value })} />
              </>
            ) : null}
            <Input placeholder={t('reason')} aria-label={t('reason')} value={ex.reason} className="sm:col-span-2" onChange={(e) => setEx({ ...ex, reason: e.target.value })} />
          </div>
          <Button
            variant="outline"
            className="mt-3"
            loading={pending}
            onClick={() =>
              run(() =>
                addException({
                  date: ex.date,
                  kind: ex.kind,
                  startTime: ex.kind === 'available' || !ex.allDay ? ex.startTime : undefined,
                  endTime: ex.kind === 'available' || !ex.allDay ? ex.endTime : undefined,
                  reason: ex.reason,
                }),
              )
            }
          >
            <Plus aria-hidden /> {t('addException')}
          </Button>
        </section>

        <section className={card}>
          <h2 className="mb-4 font-bold">{t('rules')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="r-notice" label={t('minNotice')}>
              <Input id="r-notice" type="number" min={0} max={336} value={rules.minNoticeHours} onChange={(e) => setRules({ ...rules, minNoticeHours: Number(e.target.value) })} />
            </FormField>
            <FormField id="r-adv" label={t('maxAdvance')}>
              <Input id="r-adv" type="number" min={1} max={365} value={rules.maxAdvanceDays} onChange={(e) => setRules({ ...rules, maxAdvanceDays: Number(e.target.value) })} />
            </FormField>
            <FormField id="r-buf" label={t('buffer')}>
              <Input id="r-buf" type="number" min={0} max={120} step={5} value={rules.bufferMinutes} onChange={(e) => setRules({ ...rules, bufferMinutes: Number(e.target.value) })} />
            </FormField>
            <FormField id="r-max" label={t('maxDaily')} hint={t('unlimited')}>
              <Input id="r-max" type="number" min={1} max={50} value={rules.maxDailyAppointments ?? ''} onChange={(e) => setRules({ ...rules, maxDailyAppointments: e.target.value ? Number(e.target.value) : null })} />
            </FormField>
            <FormField id="r-cancel" label={t('cancelDeadline')}>
              <Input id="r-cancel" type="number" min={0} max={168} value={rules.cancellationDeadlineHours} onChange={(e) => setRules({ ...rules, cancellationDeadlineHours: Number(e.target.value) })} />
            </FormField>
            <label className="flex items-start gap-3 text-sm sm:col-span-2">
              <Switch checked={rules.autoConfirm} onCheckedChange={(v) => setRules({ ...rules, autoConfirm: v })} />
              <span>
                <span className="block font-semibold">{t('autoConfirm')}</span>
                <span className="text-xs text-muted-foreground">{t('autoConfirmHint')}</span>
              </span>
            </label>
          </div>
          <Button className="mt-4" loading={pending} onClick={() => run(() => saveBookingRules(rules))}>
            {tc('save')}
          </Button>
        </section>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <section className={card}>
          <h2 className="mb-3 text-sm font-bold">{t('preview')}</h2>
          {!previewDuration ? (
            <p className="text-sm text-muted-foreground">{t('noOfferings')}</p>
          ) : Object.keys(preview).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('previewEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(preview).map(([day, slots]) => (
                <div key={day}>
                  <div className="mb-1 text-xs font-bold text-muted-foreground">{fmtDay.format(new Date(`${day}T00:00:00Z`))}</div>
                  <div className="flex flex-wrap gap-1">
                    {slots.map((s) => (
                      <span key={s.startsAt.toISOString()} className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                        {fmt.format(s.startsAt)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
