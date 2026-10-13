import { CreditCard } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/card'
import { refundPayment } from '@/features/admin/actions'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { ReasonAction } from '@/features/admin/components/reason-action'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { formatMoney } from '@/lib/domain/money'
import { hasPlatformPermission } from '@/lib/domain/permissions'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { Constants } from '@/types/database'

const PAGE = 30

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const ctx = await adminAccess('payments.view')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.payments')
  const tp = await getTranslations('payments')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const statuses = Constants.public.Enums.payment_status
  const canRefund = hasPlatformPermission(ctx.roles, 'payments.refund')
  const supabase = await createClient()
  let query = supabase
    .from('payments')
    .select(
      'id, reference, payable_type, amount_minor, commission_minor, refunded_minor, status, provider, provider_mode, method, failure_reason, paid_at, created_at, payer:profiles!payments_payer_id_fkey(full_name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)
  if ((statuses as readonly string[]).includes(sp.status ?? '')) query = query.eq('status', sp.status as (typeof statuses)[number])
  const ref = sp.q?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (ref) query = query.ilike('reference', `%${ref}%`)
  const [{ data, count }, { data: events }] = await Promise.all([
    query,
    supabase.from('payment_events').select('id, provider, event_type, signature_valid, processing_result, received_at').order('received_at', { ascending: false }).limit(20),
  ])
  return (
    <>
      <PageHeader title={t('title')} />
      <FilterBar
        basePath="/admin/payments"
        query={sp.q}
        queryPlaceholder={tc('reference')}
        selects={[{ name: 'status', label: tc('status'), value: sp.status, options: statuses.map((s) => ({ value: s, label: te(`payment.${s}`) })) }]}
      />
      <Section className="mb-6">
        {data?.length ? (
          <Table minWidth={980}>
            <THead>
              <Th>{tc('reference')}</Th>
              <Th>{te('role.client')}</Th>
              <Th>{t('provider')}</Th>
              <Th end>{tc('amount')}</Th>
              <Th end>{tp('finance.commission')}</Th>
              <Th end>{tc('status')}</Th>
              <Th end />
            </THead>
            <tbody>
              {data.map((p) => {
                const refundable = p.amount_minor - p.refunded_minor
                return (
                  <Tr key={p.id}>
                    <Td>
                      <div className="font-mono text-xs">{p.reference}</div>
                      <div className="text-xs text-muted-foreground">
                        {te(`payable.${p.payable_type}`)} · {formatDateTime(p.paid_at ?? p.created_at, locale)}
                      </div>
                      {p.failure_reason ? <div className="text-xs text-destructive">{p.failure_reason}</div> : null}
                    </Td>
                    <Td>{p.payer?.full_name ?? '—'}</Td>
                    <Td>
                      <span className="text-xs">{p.provider}</span>{' '}
                      {p.provider_mode !== 'live' ? <Badge variant="warning">{p.provider_mode}</Badge> : null}
                    </Td>
                    <Td end className="tabular-nums">
                      {formatMoney(p.amount_minor, locale)}
                      {p.refunded_minor ? <div className="text-xs text-destructive">−{formatMoney(p.refunded_minor, locale)}</div> : null}
                    </Td>
                    <Td end className="tabular-nums text-muted-foreground">
                      {p.commission_minor != null ? formatMoney(p.commission_minor, locale) : '—'}
                    </Td>
                    <Td end>
                      <StatusBadge status={p.status} label={te(`payment.${p.status}`)} />
                    </Td>
                    <Td end>
                      {canRefund && refundable > 0 && (p.status === 'succeeded' || p.status === 'partially_refunded') ? (
                        <ReasonAction
                          label={t('refund')}
                          title={`${t('refund')} ${p.reference}`}
                          fieldLabel={t('refundReason')}
                          amount={{ label: t('refundAmount'), max: refundable / 100 }}
                          action={refundPayment.bind(null, p.id)}
                          success={t('refundCreated')}
                        />
                      ) : null}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={CreditCard} title={tc('noData')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/payments" searchParams={sp} />
      <Section title={t('events')} className="mt-6">
        {events?.length ? (
          <Table minWidth={640}>
            <THead>
              <Th>{t('provider')}</Th>
              <Th>{tc('type')}</Th>
              <Th>{t('signature')}</Th>
              <Th>{t('result')}</Th>
              <Th end>{tc('date')}</Th>
            </THead>
            <tbody>
              {events.map((e) => (
                <Tr key={e.id}>
                  <Td className="text-xs">{e.provider}</Td>
                  <Td className="font-mono text-xs">{e.event_type}</Td>
                  <Td>{e.signature_valid ? <Badge variant="success">{t('valid')}</Badge> : <Badge variant="danger">{t('invalid')}</Badge>}</Td>
                  <Td className="text-xs text-muted-foreground">{e.processing_result ?? '—'}</Td>
                  <Td end className="text-xs">
                    {formatDateTime(e.received_at, locale)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{tc('noData')}</p>
        )}
      </Section>
    </>
  )
}
