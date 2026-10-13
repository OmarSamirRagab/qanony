/** Date/time formatting in the Africa/Cairo business timezone. */
export const CAIRO_TZ = 'Africa/Cairo'

function intlLocale(locale: string) {
  return locale === 'ar' ? 'ar-EG' : 'en-GB'
}

export function formatDate(value: string | Date | null | undefined, locale: string, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: CAIRO_TZ, ...opts }).format(new Date(value))
}

export function formatTime(value: string | Date | null | undefined, locale: string, timeZone = CAIRO_TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined, locale: string, timeZone = CAIRO_TZ) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value))
}

export function formatRelative(value: string | Date, locale: string, now = new Date()) {
  const diff = (new Date(value).getTime() - now.getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return formatDate(value, locale)
}

export function formatNumber(value: number | null | undefined, locale: string, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(intlLocale(locale), opts).format(value ?? 0)
}

/** YYYY-MM-DD of an instant in Cairo. */
export function cairoDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
