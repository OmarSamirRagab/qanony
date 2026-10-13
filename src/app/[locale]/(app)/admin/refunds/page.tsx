import { HandCoins } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { formatMoney } from '@/lib/domain/money'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/types/database'

const PAGE = 30

export default async function AdminRefunds({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('payments.refund')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.refunds')
  const te = await getTranslations('enums.refund')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.refund_status
  const supabase = await createClient()
  let query = supabase
    .from('refunds')
    .select('id, amount_minor, reason, status, attempts, failure_reason, processed_at, created_at, payment:payments(reference, provider)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  if ((statuses as readonly string[]).includes(sp.status ?? '')) query = query.eq('status', sp.status as (typeof statuses)[number])
  const { data, count } = await query
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <FilterBar basePath="/admin/refunds" selects={[{ name: 'status', label: tc('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(s) })) }]} />
      <Section>
        {data?.length ? (
          <Table minWidth={820}>
            <THead>
              <Th>{tc('reference')}</Th>
              <Th>{tc('notes')}</Th>
              <Th end>{tc('amount')}</Th>
              <Th end>{t('attempts')}</Th>
              <Th end>{tc('status')}</Th>
            </THead>
            <tbody>
              {data.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <div className="font-mono text-xs">{r.payment?.reference}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.payment?.provider} · {formatDateTime(r.processed_at ?? r.created_at, locale)}
                    </div>
                  </Td>
                  <Td className="max-w-80 text-xs">
                    {r.reason}
                    {r.failure_reason ? <div className="text-destructive">{`${t('error')}: ${r.failure_reason}`}</div> : null}
                  </Td>
                  <Td end className="tabular-nums">
                    {formatMoney(r.amount_minor, locale)}
                  </Td>
                  <Td end className="tabular-nums">
                    {r.attempts}
                  </Td>
                  <Td end>
                    <StatusBadge status={r.status} label={te(r.status)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={HandCoins} title={tc('noData')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/refunds" searchParams={sp} />
    </>
  )
}
