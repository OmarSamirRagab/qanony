import { z } from 'zod'
import { jsonError } from '@/lib/http'
import { siteUrl } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** iCalendar export for an appointment the caller can see (RLS-enforced). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return jsonError('notFound', 404)
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)
  const { data: a } = await supabase.from('appointments').select('id, reference, starts_at, ends_at, consultation_type, client_id').eq('id', id).maybeSingle()
  if (!a) return jsonError('notFound', 404)
  const portal = a.client_id === auth.user.id ? 'client' : 'lawyer'
  const url = siteUrl(`/${portal}/appointments/${a.id}`)
  // Intentionally minimal: no issue details or names in calendar data that may sync to third parties.
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qanony//Appointments//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}@qanony`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(a.starts_at)}`,
    `DTEND:${icsDate(a.ends_at)}`,
    `SUMMARY:${escape(`Qanony — ${a.reference}`)}`,
    `DESCRIPTION:${escape(url)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(a.reference)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${a.reference}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
