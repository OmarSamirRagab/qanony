import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { FirmDenied } from '@/features/firms/components/denied'
import { getFirmContext } from '@/features/firms/context'
import { MatterForm } from '@/features/matters/components/matter-forms'
import { MatterFilters, MatterList } from '@/features/matters/components/matter-list'
import { listMatters } from '@/features/matters/queries'
import { getCategories } from '@/features/reference/queries'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function FirmMattersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('matters.view')) return <FirmDenied />
  const sp = await searchParams
  const status = (['open', 'closed', 'all'].includes(sp.status ?? '') ? sp.status : 'open') as 'open'
  const page = Math.max(1, Number(sp.page) || 1)
  const t = await getTranslations('matters')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ rows, total, pageSize }, { data: clients }, { data: lawyers }, categories] = await Promise.all([
    listMatters({ scope: 'firm', userId: ctx.userId, firmId: firm.firm_id, status, q: sp.q, page }),
    supabase.from('practice_clients').select('id, full_name').eq('firm_id', firm.firm_id).order('full_name').limit(500),
    supabase.from('law_firm_members').select('user_id, profile:profiles!law_firm_members_user_id_fkey(full_name)').eq('firm_id', firm.firm_id).eq('status', 'active').in('member_type', ['owner', 'lawyer']),
    getCategories(),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          can('matters.edit') ? (
            <MatterForm
              mode="create"
              firmId={firm.firm_id}
              clients={(clients ?? []).map((c) => ({ id: c.id, label: c.full_name }))}
              lawyers={(lawyers ?? []).filter((l) => l.user_id).map((l) => ({ id: l.user_id!, label: l.profile?.full_name ?? '—' }))}
              categories={categories.map((c) => ({ id: c.id, label: pick(locale, c.name_ar, c.name_en) }))}
              basePath="/firm/matters"
            />
          ) : null
        }
      />
      <MatterFilters basePath="/firm/matters" status={status} q={sp.q} />
      <MatterList rows={rows} basePath="/firm/matters" />
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/firm/matters" searchParams={sp} />
    </>
  )
}
