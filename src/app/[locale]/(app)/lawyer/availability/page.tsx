import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { AvailabilityEditor } from '@/features/lawyer-portal/components/availability-editor'
import { requirePortal } from '@/lib/auth'
import { cairoDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function AvailabilityPage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard.availability')
  const supabase = await createClient()
  const today = cairoDate()
  const [{ data: windows }, { data: exceptions }, { data: lawyer }, { data: offerings }, { data: busy }] = await Promise.all([
    supabase.from('lawyer_availability').select('weekday, start_time, end_time').eq('lawyer_id', ctx.userId).order('weekday').order('start_time'),
    supabase.from('lawyer_availability_exceptions').select('id, exception_date, kind, start_time, end_time, reason').eq('lawyer_id', ctx.userId).gte('exception_date', today).order('exception_date'),
    supabase.from('lawyer_profiles').select('timezone, min_notice_hours, max_advance_days, buffer_minutes, max_daily_appointments, cancellation_deadline_hours, auto_confirm').eq('id', ctx.userId).single(),
    supabase.from('lawyer_consultation_offerings').select('consultation_type, duration_minutes').eq('lawyer_id', ctx.userId).eq('is_active', true),
    supabase.from('appointments').select('starts_at, ends_at').eq('lawyer_id', ctx.userId).eq('occupies_slot', true).in('status', ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS']).gte('ends_at', new Date().toISOString()),
  ])
  const scheduled = (offerings ?? []).filter((o) => o.consultation_type !== 'written_opinion')
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AvailabilityEditor
        windows={(windows ?? []).map((w) => ({ weekday: w.weekday, startTime: w.start_time.slice(0, 5), endTime: w.end_time.slice(0, 5) }))}
        exceptions={(exceptions ?? []).map((e) => ({ id: e.id, date: e.exception_date, kind: e.kind as 'unavailable', startTime: e.start_time?.slice(0, 5), endTime: e.end_time?.slice(0, 5), reason: e.reason }))}
        rules={{
          minNoticeHours: lawyer?.min_notice_hours ?? 3,
          maxAdvanceDays: lawyer?.max_advance_days ?? 60,
          bufferMinutes: lawyer?.buffer_minutes ?? 10,
          maxDailyAppointments: lawyer?.max_daily_appointments ?? null,
          cancellationDeadlineHours: lawyer?.cancellation_deadline_hours ?? 24,
          autoConfirm: lawyer?.auto_confirm ?? true,
        }}
        timezone={lawyer?.timezone ?? 'Africa/Cairo'}
        previewDuration={scheduled[0]?.duration_minutes ?? null}
        today={today}
        busy={(busy ?? []).map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at }))}
      />
    </>
  )
}
