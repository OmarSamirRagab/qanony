import { Check } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Badge } from '@/components/ui/card'
import { getPlans } from '@/features/content/queries'
import { formatMoney } from '@/lib/domain/money'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn, pick } from '@/lib/utils'
import { SubscriptionActions, SubscribeButton } from './subscription-actions'

export async function SubscriptionView({ userId, firmId }: { userId: string; firmId?: string }) {
  const t = await getTranslations('dashboard.subscription')
  const tp = await getTranslations('content.pricing')
  const te = await getTranslations('enums')
  const locale = await getLocale()
  const supabase = await createClient()
  const subQ = supabase.from('subscriptions').select('*, plan:subscription_plans(code, name_ar, name_en)').in('status', ['trialing', 'active', 'past_due', 'incomplete'])
  const [{ data: subs }, plans, { data: ent }] = await Promise.all([
    (firmId ? subQ.eq('firm_id', firmId) : subQ.eq('lawyer_id', userId)).order('created_at', { ascending: false }).limit(3),
    getPlans(),
    supabase.rpc('my_entitlements', firmId ? { p_firm_id: firmId } : {}),
  ])
  const live = subs?.find((s) => s.status !== 'incomplete') ?? null
  const incomplete = subs?.find((s) => s.status === 'incomplete') ?? null
  const audience = firmId ? 'firm' : 'lawyer'
  const currentCode = (ent as { plan?: { code: string } } | null)?.plan?.code
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Section title={t('current')} className="mb-6">
        {live ? (
          <>
            <DescriptionList
              items={[
                { label: t('current'), value: live.plan ? pick(locale, live.plan.name_ar, live.plan.name_en) : '—' },
                { label: t('status'), value: <StatusBadge status={live.status} label={te(`subscription.${live.status}`)} /> },
                { label: t('billingCycle'), value: te(`billingCycle.${live.billing_cycle as 'monthly'}`) },
                { label: live.status === 'trialing' ? t('trialEnds') : t('periodEnd'), value: formatDate(live.current_period_end, locale) },
              ]}
            />
            {live.cancel_at_period_end ? <Notice tone="warning" className="mt-4" title={t('cancelAtEnd')} /> : null}
            <div className="mt-4">
              <SubscriptionActions id={live.id} status={live.status} cancelAtEnd={live.cancel_at_period_end} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{currentCode === 'basic' ? t('basicPlan') : '—'}</p>
        )}
        {incomplete ? (
          <Notice tone="info" className="mt-4" title={`${t('renew')}: ${incomplete.plan ? pick(locale, incomplete.plan.name_ar, incomplete.plan.name_en) : ''}`}>
            <a href={`/checkout/subscription/${incomplete.id}`} className="font-semibold underline">
              {t('renew')}
            </a>
          </Notice>
        ) : null}
      </Section>
      <div className="grid gap-5 md:grid-cols-2">
        {plans
          .filter((p) => p.audience === audience)
          .map((p) => (
            <section key={p.id} className={cn('flex flex-col rounded-2xl border bg-card p-5 shadow-soft', currentCode === p.code && 'border-gold ring-2 ring-gold/30')}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{pick(locale, p.name_ar, p.name_en)}</h3>
                {currentCode === p.code ? <Badge variant="gold">{tp('current')}</Badge> : p.trial_days ? <Badge variant="info">{tp('trial', { days: p.trial_days })}</Badge> : null}
              </div>
              <div className="my-3 text-2xl font-bold">
                {p.price_monthly_minor ? formatMoney(p.price_monthly_minor, locale) : tp('freeForever')}
                {p.price_monthly_minor ? <span className="text-sm font-normal text-muted-foreground"> {tp('perMonth')}</span> : null}
              </div>
              <ul className="mb-4 flex-1 space-y-1.5 text-sm">
                {p.features
                  .filter((f) => f.enabled)
                  .map((f) => (
                    <li key={f.feature_key} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {tp(`features.${f.feature_key.replace(/\./g, '_')}` as 'features.analytics')}
                      {f.limit_value != null ? ` · ${f.limit_value}` : ''}
                    </li>
                  ))}
              </ul>
              {currentCode !== p.code && p.price_monthly_minor > 0 ? <SubscribeButton planCode={p.code} firmId={firmId} trial={p.trial_days > 0} /> : null}
            </section>
          ))}
      </div>
    </>
  )
}
