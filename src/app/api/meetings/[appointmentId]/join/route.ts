import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canJoinMeeting } from '@/lib/domain/status'
import { isSameOrigin, jsonError } from '@/lib/http'
import { ensureRoom, isVideoConfigured, meetingToken } from '@/lib/providers/video/daily'
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Issues a short-lived meeting token for an appointment participant. The
 * appointment is read with the user's own session (RLS) so only its client and
 * lawyer can join, and only inside the time window.
 */
export async function POST(req: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  if (!isSameOrigin(req)) return jsonError('forbidden', 403)
  const { appointmentId } = await params
  if (!z.uuid().safeParse(appointmentId).success) return jsonError('notFound', 404)
  if (!isVideoConfigured() || !isServiceRoleConfigured()) return jsonError('notConfigured', 503)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonError('unauthenticated', 401)
  const { data: a } = await supabase.from('appointments').select('id, reference, status, starts_at, ends_at, consultation_type, client_id, lawyer_id').eq('id', appointmentId).maybeSingle()
  if (!a || (a.client_id !== auth.user.id && a.lawyer_id !== auth.user.id)) return jsonError('notFound', 404)
  if (a.consultation_type !== 'video' && a.consultation_type !== 'voice') return jsonError('actionUnavailable', 422)
  const startsAt = new Date(a.starts_at)
  const endsAt = new Date(a.ends_at)
  if (!canJoinMeeting(a.status, startsAt, endsAt)) return jsonError('actionUnavailable', 422)

  const isLawyer = a.lawyer_id === auth.user.id
  // The lawyer joining starts the consultation.
  if (isLawyer && a.status === 'CONFIRMED') {
    await supabase.rpc('transition_appointment', { p_appointment_id: a.id, p_to: 'IN_PROGRESS', p_reason: null })
  }

  const audioOnly = a.consultation_type === 'voice'
  const expires = new Date(endsAt.getTime() + 30 * 60_000)
  try {
    const room = await ensureRoom({ name: `qanony-${a.reference.toLowerCase()}`, notBefore: new Date(startsAt.getTime() - 10 * 60_000), expires, audioOnly })
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', auth.user.id).single()
    const token = await meetingToken({ room: room.name, userId: auth.user.id, userName: profile?.full_name ?? '—', isOwner: isLawyer, expires, audioOnly })
    await createAdminClient()
      .from('meeting_sessions')
      .upsert(
        { appointment_id: a.id, provider: 'daily', room_name: room.name, room_url: room.url, media: audioOnly ? 'audio' : 'video', expires_at: expires.toISOString(), status: 'active', started_at: new Date().toISOString() },
        { onConflict: 'appointment_id', ignoreDuplicates: false },
      )
    return NextResponse.json({ ok: true, url: room.url, token, audioOnly, endsAt: a.ends_at }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[meetings]', e)
    return jsonError('providerUnavailable', 502)
  }
}
