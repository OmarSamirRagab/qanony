import { CalendarClock } from 'lucide-react'
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

export default async function AdminAppointments({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await adminAccess('appointments.view')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.appointments')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const tv = await getTranslations('admin.verification')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.appointment_status
  const supabase = await createClient()
  // Operational columns only — the client's issue summary is deliberately not selected.
  let query = supabase
    .from('appointments')
    .select(
      'id, reference, status, consultation_type, starts_at, price_minor, created_at, client:profiles!appointments_client_id_fkey(full_name), lawyer:lawyer_profiles(display_name_ar, display_name_en)',
      { count: 'exact' },
    )
    .order('starts_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  if ((statuses as readonly string[]).includes(sp.status ?? '')) query = query.eq('status', sp.status as (typeof statuses)[number])
  const ref = sp.q?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (ref) query = query.ilike('reference', `%${ref}%`)
  const { data, count } = await query
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <FilterBar
        basePath="/admin/appointments"
        query={sp.q}
        queryPlaceholder={t('search')}
        selects={[{ name: 'status', label: t('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(`appointment.${s}`) })) }]}
      />
      <Section>
        {data?.length ? (
          <Table minWidth={860}>
            <THead>
              <Th>{tc('reference')}</Th>
              <Th>{te('role.client')}</Th>
              <Th>{tv('lawyer')}</Th>
              <Th>{tc('date')}</Th>
              <Th end>{tc('amount')}</Th>
              <Th end>{tc('status')}</Th>
            </THead>
            <tbody>
              {data.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <div className="font-mono text-xs">{a.reference}</div>
                    <div className="text-xs text-muted-foreground">{te(`consultation.${a.consultation_type}`)}</div>
                  </Td>
                  <Td>{a.client?.full_name ?? '—'}</Td>
                  <Td>{(locale === 'en' && a.lawyer?.display_name_en) || a.lawyer?.display_name_ar || '—'}</Td>
                  <Td className="text-xs">{formatDateTime(a.starts_at, locale)}</Td>
                  <Td end className="tabular-nums">
                    {formatMoney(a.price_minor, locale)}
                  </Td>
                  <Td end>
                    <StatusBadge status={a.status} label={te(`appointment.${a.status}`)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={CalendarClock} title={tc('noData')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/appointments" searchParams={sp} />
    </>
  )
}
