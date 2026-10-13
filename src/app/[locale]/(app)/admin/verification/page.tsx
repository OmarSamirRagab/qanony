import { ShieldCheck } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const PAGE = 25
const STATUSES = ['pending', 'verified', 'rejected'] as const

export default async function AdminVerification({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const ctx = await adminAccess('verification.review')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.verification')
  const te = await getTranslations('enums.verification')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUSES)[number]) : 'pending'
  const page = Math.max(1, Number(sp.page) || 1)
  const supabase = await createClient()
  const { data, count } = await supabase
    .from('lawyer_verification_requests')
    .select('id, status, bar_registration_number, created_at, reviewed_at, lawyer:lawyer_profiles(id, display_name_ar, display_name_en, slug)', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .range((page - 1) * PAGE, page * PAGE - 1)
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <FilterBar basePath="/admin/verification" selects={[{ name: 'status', label: tc('status'), value: status, options: STATUSES.map((s) => ({ value: s, label: te(s) })) }]} />
      <Section>
        {data?.length ? (
          <Table minWidth={640}>
            <THead>
              <Th>{t('lawyer')}</Th>
              <Th>{t('barNumber')}</Th>
              <Th>{t('submitted')}</Th>
              <Th end>{tc('status')}</Th>
            </THead>
            <tbody>
              {data.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/verification/${r.id}`} className="font-semibold hover:text-gold">
                      {(locale === 'en' && r.lawyer?.display_name_en) || r.lawyer?.display_name_ar || '—'}
                    </Link>
                  </Td>
                  <Td>
                    <span dir="ltr" className="font-mono text-xs">
                      {r.bar_registration_number}
                    </span>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{formatDateTime(r.created_at, locale)}</Td>
                  <Td end>
                    <StatusBadge status={r.status} label={te(r.status)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={ShieldCheck} title={t('empty')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/verification" searchParams={sp} />
    </>
  )
}
