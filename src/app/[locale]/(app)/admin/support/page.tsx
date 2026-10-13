import { LifeBuoy, Mail } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/card'
import { setContactStatus } from '@/features/admin/actions'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { QuickAction } from '@/features/admin/components/reason-action'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/types/database'

const PAGE = 30

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('support.tickets')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.support')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.ticket_status
  const supabase = await createClient()
  let query = supabase
    .from('support_tickets')
    .select('id, reference, subject, status, priority, category, created_at, requester:profiles!support_tickets_requester_id_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range((page - 1) * PAGE, page * PAGE - 1)
  query = (statuses as readonly string[]).includes(sp.status ?? '') ? query.eq('status', sp.status as (typeof statuses)[number]) : query.in('status', ['open', 'pending'])
  const [{ data, count }, { data: contacts }] = await Promise.all([
    query,
    supabase.from('contact_messages').select('id, name, email, phone, subject, message, status, created_at').eq('status', 'new').order('created_at').limit(20),
  ])
  return (
    <>
      <PageHeader title={t('title')} />
      <FilterBar basePath="/admin/support" selects={[{ name: 'status', label: tc('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(`ticket.${s}`) })) }]} />
      {data?.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {data.map((tk) => (
            <li key={tk.id}>
              <Link href={`/admin/support/${tk.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50">
                <span className="font-mono text-xs text-muted-foreground">{tk.reference}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{tk.subject}</span>
                  <span className="ms-2 text-xs text-muted-foreground">{tk.requester?.full_name}</span>
                </span>
                {tk.priority === 'high' || tk.priority === 'urgent' ? <Badge variant="danger">{te(`priority.${tk.priority}`)}</Badge> : null}
                <span className="text-xs text-muted-foreground">{te(`ticketCategory.${tk.category as 'other'}`)}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(tk.created_at, locale)}</span>
                <StatusBadge status={tk.status} label={te(`ticket.${tk.status}`)} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={LifeBuoy} title={tc('noData')} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/support" searchParams={sp} />
      <Section title={t('contactMessages')} className="mt-6">
        {contacts?.length ? (
          <ul className="divide-y">
            {contacts.map((m) => (
              <li key={m.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{m.subject}</div>
                  <div className="flex gap-2">
                    <QuickAction label={t('markHandled')} action={setContactStatus.bind(null, m.id, 'handled')} success={tc('saved')} />
                    <QuickAction label={t('spam')} action={setContactStatus.bind(null, m.id, 'spam')} success={tc('saved')} variant="ghost" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden /> {m.name} · <span dir="ltr">{m.email}</span>
                  {m.phone ? (
                    <>
                      · <span dir="ltr">{m.phone}</span>
                    </>
                  ) : null}
                  · {formatDateTime(m.created_at, locale)}
                </div>
                <p className="whitespace-pre-line text-sm">{m.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tc('noData')}</p>
        )}
      </Section>
    </>
  )
}
