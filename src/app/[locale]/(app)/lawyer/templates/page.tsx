import { FileText, Lock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TemplateFiller } from '@/features/matters/components/template-filler'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { hasFeature, type Entitlements } from '@/lib/domain/entitlements'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function TemplatesPage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('matters.templates')
  const td = await getTranslations('dashboard.analytics')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data: ent } = await supabase.rpc('my_entitlements', {})
  if (!hasFeature(ent as unknown as Entitlements, 'templates')) {
    return (
      <>
        <PageHeader title={t('title')} />
        <EmptyState icon={Lock} title={t('locked')} action={<Button asChild variant="gold"><Link href="/lawyer/subscription">{td('upgradeCta')}</Link></Button>} />
      </>
    )
  }
  const [{ data: templates }, { data: matters }] = await Promise.all([
    supabase.from('document_templates').select('id, key, category, title_ar, title_en, body_ar, body_en, variables').eq('is_active', true).order('category'),
    supabase.from('legal_matters').select('id, reference, title').or(`owner_lawyer_id.eq.${ctx.userId}`).not('status', 'in', '(CLOSED,ARCHIVED)').limit(200),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Notice tone="warning" className="mb-6" title={t('draftWarning')} />
      {templates?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
              <FileText className="size-6 text-gold" aria-hidden />
              <h2 className="mt-3 font-bold">{pick(locale, tpl.title_ar, tpl.title_en)}</h2>
              <Badge variant="outline" className="mt-2 self-start">
                {t('draftWarning').split('—')[0]}
              </Badge>
              <div className="mt-auto pt-4">
                <TemplateFiller
                  title={pick(locale, tpl.title_ar, tpl.title_en)}
                  body={pick(locale, tpl.body_ar, tpl.body_en)}
                  variables={tpl.variables}
                  matters={(matters ?? []).map((m) => ({ id: m.id, label: `${m.reference} — ${m.title}` }))}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileText} title={t('empty')} />
      )}
    </>
  )
}
