import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

export async function listMatters(opts: { scope: 'client' | 'lawyer' | 'firm'; userId: string; firmId?: string; status?: 'open' | 'closed' | 'all'; q?: string; page?: number }) {
  const supabase = await createClient()
  const pageSize = 20
  const page = opts.page ?? 1
  let query = supabase
    .from('legal_matters')
    .select('id, reference, title, status, priority, opened_at, updated_at, firm_id, owner_lawyer_id, client_record:practice_clients(full_name), owner:lawyer_profiles(display_name_ar, display_name_en), category:legal_categories(name_ar, name_en)', { count: 'exact' })
  if (opts.scope === 'client') query = query.eq('client_user_id', opts.userId)
  else if (opts.scope === 'firm' && opts.firmId) query = query.eq('firm_id', opts.firmId)
  else query = query.is('firm_id', null)
  const closed: Enums<'matter_status'>[] = ['COMPLETED', 'CLOSED', 'ARCHIVED']
  if (opts.status === 'open') query = query.not('status', 'in', `(${closed.join(',')})`)
  else if (opts.status === 'closed') query = query.in('status', closed)
  if (opts.q) {
    const s = opts.q.replace(/[%,()]/g, '').slice(0, 80)
    query = query.or(`title.ilike.%${s}%,reference.ilike.%${s}%`)
  }
  const { data, count } = await query.order('updated_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], total: count ?? 0, pageSize }
}

export type MatterListRow = Awaited<ReturnType<typeof listMatters>>['rows'][number]

export async function getMatter(id: string) {
  const supabase = await createClient()
  const { data: matter } = await supabase
    .from('legal_matters')
    .select('*, client_record:practice_clients(id, full_name, phone, email, user_id), owner:lawyer_profiles(id, display_name_ar, display_name_en, slug), category:legal_categories(id, name_ar, name_en), firm:law_firms(id, name_ar, name_en)')
    .eq('id', id)
    .maybeSingle()
  if (!matter) return null
  const [events, tasks, hearings, notes, expenses, members, docs, invoices, conversation] = await Promise.all([
    supabase.from('matter_events').select('id, event_type, summary, visibility, details, occurred_at, actor:profiles(full_name)').eq('matter_id', id).order('occurred_at', { ascending: false }).limit(200),
    supabase.from('matter_tasks').select('id, title, description, status, priority, due_at, assignee_id, assignee:profiles!matter_tasks_assignee_id_fkey(full_name), completed_at').eq('matter_id', id).order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('matter_hearings').select('*').eq('matter_id', id).order('hearing_at', { ascending: false }),
    supabase.from('matter_notes').select('id, body, visibility, author_id, created_at, author:profiles(full_name)').eq('matter_id', id).order('created_at', { ascending: false }),
    supabase.from('matter_expenses').select('id, description, amount_minor, incurred_on, billable').eq('matter_id', id).order('incurred_on', { ascending: false }),
    supabase.from('matter_members').select('user_id, role, can_edit, profile:profiles!matter_members_user_id_fkey(full_name, avatar_url)').eq('matter_id', id),
    supabase.from('matter_documents').select('shared_with_client, document:documents(id, title, category, size_bytes, scan_status, created_at, current_version, owner_id, status)').eq('matter_id', id),
    supabase.from('invoices').select('id, number, status, total_minor, issued_at, due_date').eq('matter_id', id).order('created_at', { ascending: false }),
    supabase.from('conversations').select('id').eq('matter_id', id).eq('kind', 'matter').maybeSingle(),
  ])
  return {
    matter,
    events: events.data ?? [],
    tasks: tasks.data ?? [],
    hearings: hearings.data ?? [],
    notes: notes.data ?? [],
    expenses: expenses.data ?? [],
    members: members.data ?? [],
    documents: (docs.data ?? [])
      .filter((d) => d.document && d.document.status === 'active')
      .map((d) => ({ ...d.document!, shared_with_client: d.shared_with_client })),
    invoices: invoices.data ?? [],
    conversationId: conversation.data?.id ?? null,
  }
}

export type MatterDetail = NonNullable<Awaited<ReturnType<typeof getMatter>>>
