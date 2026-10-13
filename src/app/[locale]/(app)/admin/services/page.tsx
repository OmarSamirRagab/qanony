import { Tags } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { CollapsiblePanel } from '@/components/shared/collapsible-panel'
import { Pagination } from '@/components/shared/pagination'
import { moderateService } from '@/features/admin/actions'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { QuickAction, ReasonAction } from '@/features/admin/components/reason-action'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const PAGE = 20
const STATUSES = ['pending_review', 'active', 'suspended', 'draft', 'archived'] as const

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('services.moderate')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.services')
  const te = await getTranslations('enums.serviceStatus')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUSES)[number]) : 'pending_review'
  const page = Math.max(1, Number(sp.page) || 1)
  const supabase = await createClient()
  const { data, count } = await supabase
    .from('legal_services')
    .select('id, slug, title_ar, title_en, description_ar, price_minor, estimated_days, deliverables, status, moderation_note, updated_at, lawyer:lawyer_profiles(display_name_ar, display_name_en, verification_status)', { count: 'exact' })
    .eq('status', status)
    .order('updated_at', { ascending: status === 'pending_review' })
    .range((page - 1) * PAGE, page * PAGE - 1)
  return (
    <>
      <PageHeader title={t('title')} />
      <FilterBar basePath="/admin/services" selects={[{ name: 'status', label: tc('status'), value: status, options: STATUSES.map((s) => ({ value: s, label: te(s) })) }]} />
      {data?.length ? (
        <div className="space-y-4">
          {data.map((s) => (
            <Section key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold">{(locale === 'en' && s.title_en) || s.title_ar}</h2>
                  <p className="text-sm text-muted-foreground">
                    {(locale === 'en' && s.lawyer?.display_name_en) || s.lawyer?.display_name_ar} · {formatMoney(s.price_minor, locale)} · {s.estimated_days} {tc('days')} ·{' '}
                    {formatDate(s.updated_at, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={s.status} label={te(s.status as (typeof STATUSES)[number])} />
                  {s.status === 'active' ? (
                    <Link href={`/services/${s.slug}`} className="text-xs text-gold hover:underline">
                      {tc('viewDetails')}
                    </Link>
                  ) : null}
                </div>
              </div>
              <CollapsiblePanel label={tc('description')} className="mt-3">
                <p className="whitespace-pre-line text-sm">{s.description_ar}</p>
                {s.deliverables.length ? (
                  <ul className="mt-2 list-disc ps-5 text-sm">
                    {s.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </CollapsiblePanel>
              {s.moderation_note ? <p className="mt-2 text-xs text-muted-foreground">{`${t('note')}: ${s.moderation_note}`}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {s.status !== 'active' && s.status !== 'archived' ? (
                  s.lawyer?.verification_status === 'verified' ? (
                    <QuickAction label={t('approve')} action={moderateService.bind(null, s.id, 'active', '')} success={t('updated')} variant="gold" />
                  ) : (
                    <span className="text-xs text-warning">{t('lawyerNotVerified')}</span>
                  )
                ) : null}
                {s.status === 'pending_review' ? (
                  <ReasonAction label={t('returnToLawyer')} title={t('returnToLawyer')} fieldLabel={t('note')} action={moderateService.bind(null, s.id, 'draft')} success={t('updated')} />
                ) : null}
                {s.status !== 'suspended' && s.status !== 'archived' ? (
                  <ReasonAction label={t('suspend')} title={t('suspend')} fieldLabel={t('note')} action={moderateService.bind(null, s.id, 'suspended')} success={t('updated')} variant="destructive" />
                ) : null}
              </div>
            </Section>
          ))}
        </div>
      ) : (
        <EmptyState icon={Tags} title={tc('noData')} />
      )}
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/services" searchParams={sp} />
    </>
  )
}
