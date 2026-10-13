import { Gavel } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/types/database'

const PAGE = 30
const OPEN = ['open', 'under_review', 'awaiting_party'] as const

export default async function AdminDisputes({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('disputes.manage')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.disputes')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.dispute_status
  const supabase = await createClient()
  let query = supabase
    .from('disputes')
    .select('id, reference, reason, status, created_at, raiser:profiles!disputes_raised_by_fkey(full_name), against:profiles!disputes_against_user_id_fkey(full_name), appointment:appointments(reference), order:service_orders(reference)', {
      count: 'exact',
    })
    .order('created_at', { ascending: true })
    .range((page - 1) * PAGE, page * PAGE - 1)
  query = (statuses as readonly string[]).includes(sp.status ?? '') ? query.eq('status', sp.status as (typeof statuses)[number]) : query.in('status', [...OPEN])
  const { data, count } = await query
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <FilterBar basePath="/admin/disputes" selects={[{ name: 'status', label: tc('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(`dispute.${s}`) })) }]} />
      {data?.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {data.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/disputes/${d.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50">
                <span className="font-mono text-xs text-muted-foreground">{d.reference}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{d.raiser?.full_name}</span> → {d.against?.full_name ?? '—'}
                  <span className="ms-2 text-xs text-muted-foreground">{d.appointment?.reference ?? d.order?.reference}</span>
                </span>
                <span className="text-xs text-muted-foreground">{te(`disputeReason.${d.reason as 'other'}`)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(d.created_at, locale)}</span>
                <StatusBadge status={d.status} label={te(`dispute.${d.status}`)} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Gavel} title={tc('noData')} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/disputes" searchParams={sp} />
    </>
  )
}
