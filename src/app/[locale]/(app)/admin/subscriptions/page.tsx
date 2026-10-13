import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { PlanEditor } from '@/features/admin/components/plan-editor'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function AdminSubscriptions() {
  const ctx = await adminAccess('subscriptions.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.plans')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: plans }, { data: subs }] = await Promise.all([
    supabase.from('subscription_plans').select('*, features:plan_features(feature_key, enabled, limit_value)').order('sort_order'),
    supabase
      .from('subscriptions')
      .select('id, status, billing_cycle, current_period_end, cancel_at_period_end, plan:subscription_plans(code, name_ar, name_en), lawyer:lawyer_profiles(display_name_ar), firm:law_firms(name_ar)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {(plans ?? []).map((p) => (
          <Section
            key={p.id}
            title={
              <span className="flex items-center gap-2">
                {(locale === 'en' && p.name_en) || p.name_ar} <Badge variant="outline">{p.audience}</Badge>
              </span>
            }
          >
            <PlanEditor plan={{ ...p, features: [...(p.features ?? [])].sort((a, b) => a.feature_key.localeCompare(b.feature_key)) }} />
          </Section>
        ))}
      </div>
      <Section title={t('subscriptions')}>
        {subs?.length ? (
          <Table minWidth={720}>
            <THead>
              <Th>{tc('name')}</Th>
              <Th>{tc('type')}</Th>
              <Th>{tc('to')}</Th>
              <Th end>{tc('status')}</Th>
            </THead>
            <tbody>
              {subs.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-semibold">{s.lawyer?.display_name_ar ?? s.firm?.name_ar ?? '—'}</Td>
                  <Td className="text-xs">
                    {(locale === 'en' && s.plan?.name_en) || s.plan?.name_ar} · {te(`billingCycle.${s.billing_cycle as 'monthly'}`)}
                  </Td>
                  <Td className="text-xs">{formatDate(s.current_period_end, locale)}</Td>
                  <Td end>
                    <StatusBadge status={s.status} label={te(`subscription.${s.status}`)} />
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
