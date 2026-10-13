/**
 * Availability engine (pure). Mirrors public.get_available_slots() — the SQL
 * function is authoritative for booking; this module powers the lawyer's
 * schedule editor preview and is parity-tested against the database.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export interface WeeklyWindow {
  weekday: number // 0 = Sunday
  startTime: string // HH:MM
  endTime: string // HH:MM
}

export interface AvailabilityException {
  date: string // YYYY-MM-DD (lawyer local date)
  kind: 'unavailable' | 'available'
  startTime?: string | null
  endTime?: string | null
}

export interface BusyRange {
  startsAt: Date
  endsAt: Date
}

export interface SlotRules {
  timezone: string
  durationMinutes: number
  bufferMinutes: number
  minNoticeHours: number
  maxAdvanceDays: number
  maxDailyAppointments?: number | null
}

export interface Slot {
  startsAt: Date
  endsAt: Date
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) throw new RangeError(`Invalid time ${t}`)
  return h * 60 + m
}

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** Local wall-clock date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(instant: Date, timezone: string): string {
  const z = toZonedTime(instant, timezone)
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`
}

/** Validation for the schedule editor: windows must be well-formed and not overlap per weekday. */
export function findWindowProblems(windows: WeeklyWindow[]): string[] {
  const problems: string[] = []
  for (const w of windows) {
    if (w.weekday < 0 || w.weekday > 6) problems.push(`invalid_weekday:${w.weekday}`)
    if (timeToMinutes(w.endTime) <= timeToMinutes(w.startTime)) problems.push(`end_before_start:${w.weekday}:${w.startTime}`)
  }
  for (let d = 0; d <= 6; d++) {
    const day = windows
      .filter((w) => w.weekday === d)
      .map((w) => [timeToMinutes(w.startTime), timeToMinutes(w.endTime)] as const)
      .sort((a, b) => a[0] - b[0])
    for (let i = 1; i < day.length; i++) {
      if (day[i]![0] < day[i - 1]![1]) problems.push(`overlap:${d}`)
    }
  }
  return problems
}

export function generateSlots(params: {
  from: string
  to: string
  windows: WeeklyWindow[]
  exceptions: AvailabilityException[]
  busy: BusyRange[]
  /** active bookings counted toward the daily cap, keyed by local date */
  dailyCounts?: Record<string, number>
  rules: SlotRules
  now?: Date
}): Slot[] {
  const { rules } = params
  const now = params.now ?? new Date()
  const step = rules.durationMinutes + rules.bufferMinutes
  const today = localDate(now, rules.timezone)
  const maxDate = addDays(today, rules.maxAdvanceDays)
  const last = [params.to, addDays(params.from, 62), maxDate].sort()[0]!
  const earliest = now.getTime() + rules.minNoticeHours * 3_600_000
  const bufferMs = rules.bufferMinutes * 60_000
  const out = new Map<number, Slot>()

  for (let day = params.from; day <= last; day = addDays(day, 1)) {
    const dayExceptions = params.exceptions.filter((e) => e.date === day)
    const fullDayOff = dayExceptions.some((e) => e.kind === 'unavailable' && !e.startTime)
    const windows: Array<[number, number]> = []
    if (!fullDayOff) {
      for (const w of params.windows.filter((w) => w.weekday === weekdayOf(day))) {
        windows.push([timeToMinutes(w.startTime), timeToMinutes(w.endTime)])
      }
    }
    for (const e of dayExceptions.filter((e) => e.kind === 'available' && e.startTime && e.endTime)) {
      windows.push([timeToMinutes(e.startTime!), timeToMinutes(e.endTime!)])
    }
    const blocks = dayExceptions
      .filter((e) => e.kind === 'unavailable' && e.startTime && e.endTime)
      .map((e) => [timeToMinutes(e.startTime!), timeToMinutes(e.endTime!)] as const)

    const cap = rules.maxDailyAppointments
    if (cap != null && (params.dailyCounts?.[day] ?? 0) >= cap) continue

    for (const [ws, we] of windows) {
      for (let s = ws; s + rules.durationMinutes <= we; s += step) {
        const e = s + rules.durationMinutes
        if (blocks.some(([bs, be]) => bs < e && s < be)) continue
        const startsAt = fromZonedTime(`${day}T${minutesToTime(s)}:00`, rules.timezone)
        const endsAt = new Date(startsAt.getTime() + rules.durationMinutes * 60_000)
        if (startsAt.getTime() < earliest) continue
        const clash = params.busy.some(
          (b) => b.startsAt.getTime() < endsAt.getTime() + bufferMs && startsAt.getTime() - bufferMs < b.endsAt.getTime(),
        )
        if (clash) continue
        out.set(startsAt.getTime(), { startsAt, endsAt })
      }
    }
  }
  return [...out.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** Groups slots by lawyer-local date for the booking calendar. */
export function groupSlotsByDay(slots: Slot[], timezone: string): Record<string, Slot[]> {
  const groups: Record<string, Slot[]> = {}
  for (const s of slots) {
    const key = localDate(s.startsAt, timezone)
    ;(groups[key] ??= []).push(s)
  }
  return groups
}
