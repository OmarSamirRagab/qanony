import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

export type AppointmentTab = 'upcoming' | 'pending' | 'past' | 'all'

const LIST_SELECT =
  'id, reference, status, consultation_type, starts_at, ends_at, occupies_slot, price_minor, hold_expires_at, lawyer_id, client_id, firm_id, lawyer:lawyer_profiles(slug, display_name_ar, display_name_en, photo_url, timezone), client:profiles!appointments_client_id_fkey(full_name, avatar_url)'

export async function listAppointments(opts: { as: 'client' | 'lawyer'; tab: AppointmentTab; page?: number; firmId?: string; lawyerId?: string }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { rows: [], total: 0 }
  const pageSize = 20
  const page = opts.page ?? 1
  let q = supabase.from('appointments').select(LIST_SELECT, { count: 'exact' })
  if (opts.firmId) {
    q = q.eq('firm_id', opts.firmId)
    if (opts.lawyerId) q = q.eq('lawyer_id', opts.lawyerId)
  } else {
    q = q.eq(opts.as === 'client' ? 'client_id' : 'lawyer_id', auth.user.id)
  }
  const now = new Date().toISOString()
  const active: Enums<'appointment_status'>[] = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS']
  if (opts.tab === 'upcoming') q = q.in('status', active).gte('ends_at', now).order('starts_at', { ascending: true })
  else if (opts.tab === 'pending')
    q = (opts.as === 'lawyer' ? q.in('status', ['PENDING_CONFIRMATION', 'IN_PROGRESS', 'DISPUTED']) : q.in('status', ['PENDING_PAYMENT', 'DISPUTED'])).order('starts_at', { ascending: true })
  else if (opts.tab === 'past') q = q.or(`ends_at.lt.${now},status.in.(COMPLETED,CANCELLED,EXPIRED,NO_SHOW,REFUNDED)`).order('starts_at', { ascending: false })
  else q = q.order('starts_at', { ascending: false })
  const { data, count } = await q.range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], total: count ?? 0, pageSize }
}

export type AppointmentListRow = Awaited<ReturnType<typeof listAppointments>>['rows'][number]

export async function getAppointment(id: string) {
  const supabase = await createClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select(
      '*, lawyer:lawyer_profiles(id, slug, display_name_ar, display_name_en, photo_url, timezone, cancellation_deadline_hours), client:profiles!appointments_client_id_fkey(id, full_name, phone, avatar_url), office:lawyer_offices(label, address_ar, address_en, map_url), category:legal_categories(name_ar, name_en)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!appt) return null
  const [notes, events, documents, conversation, review, payment, dispute, offerings] = await Promise.all([
    supabase.from('appointment_notes').select('id, body, shared_with_client, author_id, created_at').eq('appointment_id', id).order('created_at', { ascending: false }),
    supabase.from('appointment_events').select('id, event_type, from_status, to_status, details, created_at').eq('appointment_id', id).order('created_at'),
    supabase.from('documents').select('id, title, category, size_bytes, mime_type, scan_status, status, owner_id, created_at, current_version').eq('appointment_id', id).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('conversations').select('id').eq('appointment_id', id).maybeSingle(),
    supabase.from('reviews').select('id, rating, comment, status').eq('appointment_id', id).maybeSingle(),
    supabase.from('payments').select('id, status, amount_minor, refunded_minor, reference, provider').eq('appointment_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('disputes').select('id, reference, status').eq('appointment_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('lawyer_consultation_offerings').select('consultation_type, price_minor, duration_minutes').eq('lawyer_id', appt.lawyer_id).eq('is_active', true),
  ])
  return {
    appt,
    notes: notes.data ?? [],
    events: events.data ?? [],
    documents: documents.data ?? [],
    conversationId: conversation.data?.id ?? null,
    review: review.data,
    payment: payment.data,
    dispute: dispute.data,
    offerings: offerings.data ?? [],
  }
}

export type AppointmentDetail = NonNullable<Awaited<ReturnType<typeof getAppointment>>>
