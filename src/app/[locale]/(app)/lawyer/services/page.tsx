import { Tags } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { ServiceDialog } from '@/features/lawyer-portal/components/service-dialog'
import { getCategories } from '@/features/reference/queries'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { formatMoney } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function LawyerServicesPage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard.services')
  const te = await getTranslations('enums.serviceStatus')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: services }, categories] = await Promise.all([
    supabase.from('legal_services').select('*').eq('lawyer_id', ctx.userId).neq('status', 'archived').order('created_at', { ascending: false }),
    getCategories(),
  ])
  const cats = categories.map((c) => ({ id: c.id, name: pick(locale, c.name_ar, c.name_en) }))
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<ServiceDialog categories={cats} />} />
      {services?.length ? (
        <ul className="space-y-3">
          {services.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{pick(locale, s.title_ar, s.title_en)}</div>
                <div className="text-sm text-muted-foreground">
                  {formatMoney(s.price_minor, locale)} · {tc('days', { count: s.estimated_days })}
                </div>
                {s.moderation_note ? <div className="mt-1 text-xs text-warning">{s.moderation_note}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} label={te(s.status as 'draft')} />
                {s.status === 'active' ? (
                  <Link href={`/services/${s.slug}`} className="text-xs font-semibold text-gold">
                    {tc('viewDetails')}
                  </Link>
                ) : null}
                <ServiceDialog initial={s} categories={cats} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Tags} title={t('empty')} />
      )}
    </>
  )
}
