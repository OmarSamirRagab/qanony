'use client'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, FileText, Loader2, MapPin, Paperclip, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/primitives'
import { Link, useRouter } from '@/i18n/navigation'
import { ACCEPT_ATTR, formatBytes, isAllowedFile } from '@/lib/files'
import { formatMoney } from '@/lib/domain/money'
import { addDaysIso, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Enums } from '@/types/database'
import { uploadDocument } from '@/features/documents/upload-client'
import { bookAppointment, fetchSlots } from '../actions'

type Kind = Enums<'consultation_kind'>

export interface BookingWizardProps {
  lawyer: { id: string; slug: string; name: string; timezone: string; cancellationDeadlineHours: number }
  offerings: { consultation_type: Kind; price_minor: number; duration_minutes: number }[]
  offices: { id: string; label: string; address: string }[]
  categories: { id: string; name: string }[]
  initialType?: Kind
  today: string
  holdMinutes: number
  latePercent: number
  writtenOpinionDays: number
  viewer: 'anonymous' | 'client' | 'not_client'
}

const WINDOW = 7

export function BookingWizard(props: BookingWizardProps) {
  const t = useTranslations('booking')
  const tc = useTranslations('common')
  const te = useTranslations('enums.consultation')
  const terr = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2 | 3>(props.initialType ? 1 : 0)
  const [type, setType] = useState<Kind | undefined>(props.initialType)
  const [from, setFrom] = useState(props.today)
  const [slot, setSlot] = useState<string | null>(null)
  const [issue, setIssue] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [officeId, setOfficeId] = useState(props.offices[0]?.id ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [pending, start] = useTransition()
  const [stage, setStage] = useState<'booking' | 'uploading' | null>(null)

  const offering = props.offerings.find((o) => o.consultation_type === type)
  const scheduled = type !== 'written_opinion'
  const to = addDaysIso(from, WINDOW - 1)

  const slotsQuery = useQuery({
    queryKey: ['slots', props.lawyer.id, type, from],
    enabled: Boolean(type && scheduled && step === 1),
    queryFn: () => fetchSlots(props.lawyer.id, type!, from, to),
  })

  const days = useMemo(() => {
    const list: { date: string; slots: { starts_at: string }[] }[] = []
    for (let i = 0; i < WINDOW; i++) list.push({ date: addDaysIso(from, i), slots: [] })
    for (const s of slotsQuery.data ?? []) {
      const local = new Intl.DateTimeFormat('en-CA', { timeZone: props.lawyer.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.starts_at))
      list.find((d) => d.date === local)?.slots.push(s)
    }
    return list
  }, [slotsQuery.data, from, props.lawyer.timezone])

  const steps = [t('steps.type'), t('steps.slot'), t('steps.details'), t('steps.review')]
  const issueValid = issue.trim().length >= 20

  function next() {
    if (step === 0 && type) setStep(scheduled ? 1 : 2)
    else if (step === 1 && slot) setStep(2)
    else if (step === 2 && issueValid) setStep(3)
  }
  function back() {
    if (step === 2 && !scheduled) setStep(0)
    else if (step > 0) setStep((s) => (s - 1) as 0 | 1 | 2)
  }

  function submit() {
    if (!type) return
    start(async () => {
      setStage('booking')
      const res = await bookAppointment({
        lawyerId: props.lawyer.id,
        type,
        startsAt: scheduled ? slot : null,
        issue,
        categoryId: categoryId || null,
        officeId: type === 'in_person' ? officeId || null : null,
      })
      if (!res.ok) {
        setStage(null)
        toast.error(res.detail ?? terr(res.error))
        if (res.error === 'slotUnavailable') {
          setSlot(null)
          setStep(1)
          void slotsQuery.refetch()
        }
        return
      }
      if (files.length) {
        setStage('uploading')
        for (const file of files) {
          const up = await uploadDocument(file, { category: 'case_document', appointmentId: res.data.id })
          if (!up.ok) toast.error(`${file.name}: ${terr(up.error)}`)
        }
      }
      if (res.data.status === 'PENDING_PAYMENT') router.push(`/checkout/appointment/${res.data.id}`)
      else router.push(`/client/appointments/${res.data.id}?booked=1`)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
        {/* Stepper */}
        <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((label, i) => (
            <li key={label} className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-xs font-bold',
                  i < step && 'border-gold bg-gold text-gold-foreground',
                  i === step && 'border-primary bg-primary text-primary-foreground dark:border-gold dark:bg-gold dark:text-gold-foreground',
                  i > step && 'text-muted-foreground',
                )}
                aria-current={i === step ? 'step' : undefined}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('text-sm font-semibold', i === step ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
              {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <fieldset>
            <legend className="mb-4 text-lg font-bold">{t('chooseType')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {props.offerings.map((o) => (
                <button
                  key={o.consultation_type}
                  type="button"
                  onClick={() => {
                    setType(o.consultation_type)
                    setSlot(null)
                  }}
                  className={cn(
                    'cursor-pointer rounded-xl border p-4 text-start transition-all hover:border-gold/60',
                    type === o.consultation_type && 'border-gold bg-gold-soft/50 ring-2 ring-gold/30',
                  )}
                  aria-pressed={type === o.consultation_type}
                >
                  <div className="font-bold">{te(o.consultation_type)}</div>
                  <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> {t('duration', { count: o.duration_minutes })}
                    </span>
                    <span className="font-bold text-foreground">{o.price_minor === 0 ? tc('free') : formatMoney(o.price_minor, locale)}</span>
                  </div>
                </button>
              ))}
            </div>
            {type === 'written_opinion' ? <p className="mt-4 text-sm text-muted-foreground">{t('writtenOpinionNote', { days: props.writtenOpinionDays })}</p> : null}
          </fieldset>
        )}

        {step === 1 && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t('chooseSlot')}</h2>
              <span className="text-xs text-muted-foreground">{t('timezoneNote')}</span>
            </div>
            <div className="mb-4 flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" disabled={from <= props.today} onClick={() => setFrom(addDaysIso(from, -WINDOW))}>
                <ChevronRight className="ltr:rotate-180" aria-hidden /> {t('prevWeek')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFrom(addDaysIso(from, WINDOW))}>
                {t('nextWeek')} <ChevronLeft className="ltr:rotate-180" aria-hidden />
              </Button>
            </div>
            {slotsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t('loadingSlots')}
              </div>
            ) : days.every((d) => d.slots.length === 0) ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                <CalendarDays className="mx-auto mb-2 size-6 text-gold" aria-hidden />
                {t('noSlots')}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {days
                  .filter((d) => d.slots.length)
                  .map((d) => (
                    <div key={d.date} className="rounded-xl border p-3">
                      <div className="mb-2 text-sm font-bold">
                        {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.slots.map((s) => (
                          <button
                            key={s.starts_at}
                            type="button"
                            onClick={() => setSlot(s.starts_at)}
                            className={cn(
                              'cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors hover:border-gold',
                              slot === s.starts_at && 'border-gold bg-gold text-gold-foreground',
                            )}
                            aria-pressed={slot === s.starts_at}
                          >
                            {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: props.lawyer.timezone }).format(new Date(s.starts_at))}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="issue">{t('issue')}</Label>
              <Textarea id="issue" rows={7} value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={4000} aria-invalid={issue.length > 0 && !issueValid} aria-describedby="issue-hint" />
              <p id="issue-hint" className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{t('issueHint')}</span>
                <span className="tabular-nums">{issue.trim().length}/4000</span>
              </p>
              {issue.length > 0 && !issueValid ? <p className="text-xs text-destructive">{terr('tooShort', { min: 20 })}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">{t('category')}</Label>
                <NativeSelect id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('categoryPlaceholder')}</option>
                  {props.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {type === 'in_person' && props.offices.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="office">{t('office')}</Label>
                  <NativeSelect id="office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                    {props.offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.address}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="files">{t('attachments')}</Label>
              <Input
                id="files"
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="h-auto py-2"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  const bad = picked.filter((f) => !isAllowedFile(f))
                  if (bad.length) toast.error(terr('invalidFile'))
                  setFiles((prev) => [...prev, ...picked.filter((f) => isAllowedFile(f))].slice(0, 5))
                  e.target.value = ''
                }}
              />
              <p className="text-xs text-muted-foreground">{t('attachmentsHint')}</p>
              {files.length ? (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="size-4 shrink-0 text-gold" aria-hidden />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size, locale)}</span>
                      </span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="cursor-pointer rounded p-1 hover:bg-card" aria-label={tc('remove')}>
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}

        {step === 3 && offering && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('summary')}</h2>
            <dl className="divide-y rounded-xl border">
              {[
                [t('lawyer'), props.lawyer.name],
                [t('type'), te(offering.consultation_type)],
                [t('when'), scheduled && slot ? formatDateTime(slot, locale, props.lawyer.timezone) : t('writtenOpinionNote', { days: props.writtenOpinionDays })],
                [t('fee'), offering.price_minor === 0 ? tc('free') : formatMoney(offering.price_minor, locale)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-end font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-xl bg-muted/70 p-4 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <FileText className="size-4 text-gold" aria-hidden /> {t('policyTitle')}
              </div>
              <p className="text-muted-foreground">{t('policy', { hours: props.lawyer.cancellationDeadlineHours, percent: props.latePercent })}</p>
              {offering.price_minor > 0 ? <p className="mt-2 text-muted-foreground">{t('holdNote', { minutes: props.holdMinutes })}</p> : null}
            </div>
            {props.viewer === 'not_client' ? <p className="text-sm text-destructive">{t('clientOnly')}</p> : null}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
            <ChevronRight className="ltr:rotate-180" aria-hidden /> {tc('back')}
          </Button>
          {step < 3 ? (
            <Button onClick={next} disabled={(step === 0 && !type) || (step === 1 && !slot) || (step === 2 && !issueValid)}>
              {tc('next')} <ChevronLeft className="ltr:rotate-180" aria-hidden />
            </Button>
          ) : props.viewer === 'anonymous' ? (
            <Button asChild variant="gold">
              <Link href={`/login?next=${encodeURIComponent(`/book/${props.lawyer.slug}`)}`}>{t('loginToBook')}</Link>
            </Button>
          ) : (
            <Button variant="gold" onClick={submit} loading={pending} disabled={props.viewer !== 'client'}>
              {stage === 'uploading' ? tc('upload') : offering && offering.price_minor > 0 ? t('confirmPay') : t('confirmFree')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary sidebar */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <div className="text-sm text-muted-foreground">{t('lawyer')}</div>
          <div className="font-bold">{props.lawyer.name}</div>
          {offering ? (
            <div className="mt-4 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('type')}</span>
                <span className="font-semibold">{te(offering.consultation_type)}</span>
              </div>
              {slot ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('when')}</span>
                  <span className="text-end font-semibold">{formatDateTime(slot, locale, props.lawyer.timezone)}</span>
                </div>
              ) : null}
              {type === 'in_person' && officeId ? (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {props.offices.find((o) => o.id === officeId)?.address}
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 text-base">
                <span className="font-bold">{tc('total')}</span>
                <span className="font-bold">{offering.price_minor === 0 ? tc('free') : formatMoney(offering.price_minor, locale)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
