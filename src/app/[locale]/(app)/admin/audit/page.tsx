import { ScrollText } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const PAGE = 50

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await adminAccess('audit.view')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.audit')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const supabase = await createClient()
  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  const action = sp.q?.trim().replace(/[^a-z0-9._-]/gi, '').slice(0, 60)
  if (action) query = query.ilike('action', `${action}%`)
  const { data, count } = await query
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter((x): x is string => Boolean(x)))]
  const { data: actors } = actorIds.length ? await supabase.from('profiles').select('id, full_name').in('id', actorIds) : { data: [] }
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name]))
  return (
    <>
      <PageHeader title={t('title')} />
      <FilterBar basePath="/admin/audit" query={sp.q} queryPlaceholder={t('search')} />
      <Section>
        {data?.length ? (
          <Table minWidth={900}>
            <THead>
              <Th>{tc('date')}</Th>
              <Th>{t('actor')}</Th>
              <Th>{t('action')}</Th>
              <Th>{t('entity')}</Th>
              <Th>{t('details')}</Th>
            </THead>
            <tbody>
              {data.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at, locale)}</Td>
                  <Td className="text-xs">{r.actor_id ? (names.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : t('system')}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td className="text-xs">
                    <span dir="ltr">
                      {r.entity_type}
                      {r.entity_id ? `:${r.entity_id.slice(0, 8)}` : ''}
                    </span>
                  </Td>
                  <Td>
                    <pre dir="ltr" className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                      {JSON.stringify(r.metadata)}
                    </pre>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={ScrollText} title={tc('noData')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/audit" searchParams={sp} />
    </>
  )
}
