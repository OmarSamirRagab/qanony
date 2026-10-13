import { Check, Minus, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Container, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getPlans } from '@/features/content/queries'
import { Link } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { formatMoney } from '@/lib/domain/money'
import { cn, pick } from '@/lib/utils'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: 'content.pricing' })
  return { title: t('metaTitle'), description: t('subtitle') }
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale)
  setRequestLocale(locale)
  const t = await getTranslations('content.pricing')
  const plans = await getPlans()
  const featureKeys = Array.from(new Set(plans.flatMap((p) => p.features.map((f) => f.feature_key))))
  return (
    <Container className="py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <section className="mb-10 flex flex-col gap-3 rounded-2xl border bg-gold-soft/50 p-6 sm:flex-row sm:items-center">
        <Users className="size-8 shrink-0 text-gold" aria-hidden />
        <div>
          <h2 className="font-bold">{t('clientsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('clientsBody')}</p>
        </div>
      </section>
      <h2 className="mb-5 text-xl font-bold">{t('lawyersTitle')}</h2>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p, i) => {
          const highlight = p.code === 'professional'
          return (
            <section key={p.id} className={cn('flex flex-col rounded-2xl border bg-card p-6 shadow-soft', highlight && 'border-gold shadow-lift ring-2 ring-gold/30')}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{pick(locale, p.name_ar, p.name_en)}</h3>
                {p.trial_days > 0 ? <Badge variant="gold">{t('trial', { days: p.trial_days })}</Badge> : null}
              </div>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{pick(locale, p.description_ar ?? '', p.description_en)}</p>
              <div className="my-5">
                {p.price_monthly_minor === 0 ? (
                  <span className="text-3xl font-bold">{t('freeForever')}</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold">{formatMoney(p.price_monthly_minor, locale)}</span>
                    <span className="text-sm text-muted-foreground"> {t('perMonth')}</span>
                    <div className="text-xs text-muted-foreground">
                      {formatMoney(p.price_yearly_minor, locale)} {t('perYear')}
                    </div>
                  </>
                )}
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {featureKeys.map((k) => {
                  const f = p.features.find((x) => x.feature_key === k)
                  const on = f?.enabled
                  return (
                    <li key={k} className={cn('flex items-start gap-2', !on && 'text-muted-foreground/60')}>
                      {on ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />}
                      <span>
                        {t(`features.${k.replace(/\./g, '_')}` as 'features.analytics')}
                        {on && f?.limit_value != null ? <span className="font-semibold"> · {f.limit_value}</span> : on && ['bookings.monthly', 'matters.active', 'services.listings', 'firm.lawyers', 'firm.staff'].includes(k) ? <span className="font-semibold"> · {t('unlimited')}</span> : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <Button asChild variant={highlight ? 'gold' : 'outline'} className="mt-6">
                <Link href={p.audience === 'firm' ? `/register/lawyer?firm=1&plan=${p.code}` : `/register/lawyer?plan=${p.code}`}>{t('choose')}</Link>
              </Button>
              <span className="sr-only">{i}</span>
            </section>
          )
        })}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{t('commissionNote')}</p>
    </Container>
  )
}
