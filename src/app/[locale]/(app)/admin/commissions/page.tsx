import { Percent } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section } from '@/components/shared'
import { CommissionForm, RuleActiveSwitch } from '@/features/admin/components/commission-form'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const SCOPE_ORDER = { service: 0, lawyer: 1, firm: 2, promotion: 3, global: 4 } as const

export default async function AdminCommissions() {
  const ctx = await adminAccess('settings.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.commissions')
  const tp = await getTranslations('enums.payable')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase
    .from('commission_rules')
    .select('*, lawyer:lawyer_profiles(display_name_ar), firm:law_firms(name_ar), service:legal_services(title_ar)')
    .order('created_at', { ascending: false })
  const rules = (data ?? []).sort((a, b) => Number(b.is_active) - Number(a.is_active) || SCOPE_ORDER[a.scope as keyof typeof SCOPE_ORDER] - SCOPE_ORDER[b.scope as keyof typeof SCOPE_ORDER])
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Section>
          {rules.length ? (
            <Table minWidth={760}>
              <THead>
                <Th>{t('scope')}</Th>
                <Th>{t('appliesTo')}</Th>
                <Th end>{t('rate')}</Th>
                <Th>{tc('dateRange')}</Th>
                <Th end>{tc('status')}</Th>
              </THead>
              <tbody>
                {rules.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-semibold">{t(`scopes.${r.scope as 'global'}`)}</div>
                      <div className="text-xs text-muted-foreground">{r.lawyer?.display_name_ar ?? r.firm?.name_ar ?? r.service?.title_ar ?? r.description ?? ''}</div>
                    </Td>
                    <Td className="text-xs">{r.applies_to ? tp(r.applies_to) : tc('all')}</Td>
                    <Td end className="tabular-nums">
                      {(r.rate_bps / 100).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}%{r.fixed_minor ? ` + ${formatMoney(r.fixed_minor, locale)}` : ''}
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {r.starts_at ? formatDate(r.starts_at, locale) : '—'} → {r.ends_at ? formatDate(r.ends_at, locale) : '∞'}
                    </Td>
                    <Td end>
                      <RuleActiveSwitch id={r.id} active={r.is_active} label={t('deactivate')} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={Percent} title={tc('noData')} className="border-0" />
          )}
        </Section>
        <aside>
          <Section title={t('add')}>
            <CommissionForm />
          </Section>
        </aside>
      </div>
    </>
  )
}
