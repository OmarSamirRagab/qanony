import 'server-only'
import { createClient } from '@/lib/supabase/server'

export async function listOrders(as: 'client' | 'lawyer', userId: string, page = 1) {
  const supabase = await createClient()
  const pageSize = 20
  const { data, count } = await supabase
    .from('service_orders')
    .select('id, reference, status, price_minor, due_at, created_at, service:legal_services(title_ar, title_en), client:profiles!service_orders_client_id_fkey(full_name), lawyer:lawyer_profiles(display_name_ar, display_name_en)', { count: 'exact' })
    .eq(as === 'client' ? 'client_id' : 'lawyer_id', userId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], total: count ?? 0, pageSize }
}

export async function getOrder(id: string) {
  const supabase = await createClient()
  const { data: order } = await supabase
    .from('service_orders')
    .select('*, service:legal_services(id, slug, title_ar, title_en, deliverables, required_documents), package:service_packages(name_ar, name_en), client:profiles!service_orders_client_id_fkey(id, full_name, phone), lawyer:lawyer_profiles(id, slug, display_name_ar, display_name_en, photo_url)')
    .eq('id', id)
    .maybeSingle()
  if (!order) return null
  const [docs, conv, review, dispute, payment] = await Promise.all([
    supabase.from('documents').select('id, title, category, size_bytes, scan_status, created_at, current_version, owner_id, ai_processing_allowed').eq('service_order_id', id).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('conversations').select('id').eq('service_order_id', id).maybeSingle(),
    supabase.from('reviews').select('id, rating, status').eq('service_order_id', id).maybeSingle(),
    supabase.from('disputes').select('id, reference, status').eq('service_order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('payments').select('status, provider').eq('service_order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  return { order, documents: docs.data ?? [], conversationId: conv.data?.id ?? null, review: review.data, dispute: dispute.data, payment: payment.data }
}
