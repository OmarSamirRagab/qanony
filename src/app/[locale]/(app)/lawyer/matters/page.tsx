import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { MatterForm } from '@/features/matters/components/matter-forms'
import { MatterFilters, MatterList } from '@/features/matters/components/matter-list'
import { listMatters } from '@/features/matters/queries'
import { getCategories } from '@/features/reference/queries'
import { requirePortal } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function LawyerMattersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const ctx = await requirePortal('lawyer')
  const sp = await searchParams
  const status = (['open', 'closed', 'all'].includes(sp.status ?? '') ? sp.status : 'open') as 'open'
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('matters')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ rows, total, pageSize }, { data: clients }, categories] = await Promise.all([
    listMatters({ scope: 'lawyer', userId: ctx.userId, status, q: sp.q, page }),
    supabase.from('practice_clients').select('id, full_name').eq('owner_lawyer_id', ctx.userId).order('full_name').limit(500),
    getCategories(),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <MatterForm
            mode="create"
            clients={(clients ?? []).map((c) => ({ id: c.id, label: c.full_name }))}
            categories={categories.map((c) => ({ id: c.id, label: pick(locale, c.name_ar, c.name_en) }))}
            basePath="/lawyer/matters"
          />
        }
      />
      <MatterFilters basePath="/lawyer/matters" status={status} q={sp.q} />
      <MatterList rows={rows} basePath="/lawyer/matters" />
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/lawyer/matters" searchParams={sp} />
    </>
  )
}
