import { Building2 } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { setFirmVerification } from '@/features/admin/actions'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { ReasonAction } from '@/features/admin/components/reason-action'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const PAGE = 25
const STATUSES = ['unverified', 'pending', 'verified', 'rejected', 'suspended'] as const

export default async function AdminFirms({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await adminAccess('firms.manage')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.firms')
  const tv = await getTranslations('admin.verification')
  const te = await getTranslations('enums.verification')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const supabase = await createClient()
  let query = supabase
    .from('law_firms')
    .select('id, slug, name_ar, name_en, verification_status, is_published, commercial_registration, created_at, owner:profiles!law_firms_owner_id_fkey(full_name), members:law_firm_members(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  if ((STATUSES as readonly string[]).includes(sp.status ?? '')) query = query.eq('verification_status', sp.status as (typeof STATUSES)[number])
  const q = sp.q?.trim().slice(0, 80).replace(/[%,()]/g, '')
  if (q) query = query.or(`name_ar.ilike.%${q}%,name_en.ilike.%${q}%,slug.ilike.%${q}%`)
  const { data, count } = await query
  return (
    <>
      <PageHeader title={t('title')} />
      <FilterBar
        basePath="/admin/firms"
        query={sp.q}
        queryPlaceholder={tc('searchPlaceholder')}
        selects={[{ name: 'status', label: tc('status'), value: sp.status, options: STATUSES.map((s) => ({ value: s, label: te(s) })) }]}
      />
      <Section>
        {data?.length ? (
          <Table minWidth={820}>
            <THead>
              <Th>{tc('name')}</Th>
              <Th>{t('owner')}</Th>
              <Th end>{t('members')}</Th>
              <Th>{tc('createdAt')}</Th>
              <Th>{tc('status')}</Th>
              <Th end>{tc('actions')}</Th>
            </THead>
            <tbody>
              {data.map((f) => (
                <Tr key={f.id}>
                  <Td>
                    <div className="font-semibold">{(locale === 'en' && f.name_en) || f.name_ar}</div>
                    {f.verification_status === 'verified' && f.is_published ? (
                      <Link href={`/firms/${f.slug}`} className="text-xs text-gold hover:underline">
                        /firms/{f.slug}
                      </Link>
                    ) : (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {f.slug}
                      </div>
                    )}
                    {f.commercial_registration ? (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        CR {f.commercial_registration}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{f.owner?.full_name ?? '—'}</Td>
                  <Td end className="tabular-nums">
                    {f.members?.[0]?.count ?? 0}
                  </Td>
                  <Td className="text-xs text-muted-foreground">{formatDate(f.created_at, locale)}</Td>
                  <Td>
                    <StatusBadge status={f.verification_status} label={te(f.verification_status)} />
                  </Td>
                  <Td end>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {f.verification_status !== 'verified' ? (
                        <ReasonAction label={t('verify')} title={t('verify')} fieldLabel={tv('reason')} action={setFirmVerification.bind(null, f.id, 'verified')} success={tv('decided')} variant="gold" />
                      ) : null}
                      {f.verification_status === 'pending' || f.verification_status === 'unverified' ? (
                        <ReasonAction label={t('reject')} title={t('reject')} fieldLabel={tv('reason')} action={setFirmVerification.bind(null, f.id, 'rejected')} success={tv('decided')} />
                      ) : null}
                      {f.verification_status === 'verified' ? (
                        <ReasonAction label={t('suspend')} title={t('suspend')} fieldLabel={tv('reason')} action={setFirmVerification.bind(null, f.id, 'suspended')} success={tv('decided')} variant="destructive" />
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={Building2} title={tc('noData')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/firms" searchParams={sp} />
    </>
  )
}
