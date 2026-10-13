import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { MatterFilters, MatterList } from '@/features/matters/components/matter-list'
import { listMatters } from '@/features/matters/queries'
import { requirePortal } from '@/lib/auth'

export default async function ClientMattersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const ctx = await requirePortal('client')
  const sp = await searchParams
  const status = (['open', 'closed', 'all'].includes(sp.status ?? '') ? sp.status : 'open') as 'open'
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('matters')
  const { rows, total, pageSize } = await listMatters({ scope: 'client', userId: ctx.userId, status, q: sp.q, page })
  return (
    <>
      <PageHeader title={t('clientTitle')} description={t('clientSubtitle')} />
      <MatterFilters basePath="/client/matters" status={status} q={sp.q} />
      <MatterList rows={rows} basePath="/client/matters" showClient={false} />
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/client/matters" searchParams={sp} />
    </>
  )
}
