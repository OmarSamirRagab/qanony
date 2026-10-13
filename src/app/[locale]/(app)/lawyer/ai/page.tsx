import { Lock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { LawyerTools } from '@/features/ai/components/lawyer-tools'
import { Link } from '@/i18n/navigation'
import { requirePortal } from '@/lib/auth'
import { hasFeature, type Entitlements } from '@/lib/domain/entitlements'
import { isAiConfigured } from '@/lib/providers/ai/anthropic'
import { createClient } from '@/lib/supabase/server'

export default async function LawyerAiPage() {
  await requirePortal('lawyer')
  const t = await getTranslations('ai')
  const td = await getTranslations('dashboard.analytics')
  const supabase = await createClient()
  const { data: ent } = await supabase.rpc('my_entitlements', {})
  if (!hasFeature(ent as unknown as Entitlements, 'ai.tools')) {
    return (
      <>
        <PageHeader title={t('tools.title')} />
        <EmptyState icon={Lock} title={t('tools.locked')} action={<Button asChild variant="gold"><Link href="/lawyer/subscription">{td('upgradeCta')}</Link></Button>} />
      </>
    )
  }
  const [{ data: docs }, { data: matters }] = await Promise.all([
    supabase.from('documents').select('id, title').eq('status', 'active').eq('ai_processing_allowed', true).neq('scan_status', 'infected').order('created_at', { ascending: false }).limit(200),
    supabase.from('legal_matters').select('id, reference, title').eq('ai_enabled', true).not('status', 'in', '(ARCHIVED)').limit(200),
  ])
  return (
    <>
      <PageHeader title={t('tools.title')} description={t('tools.subtitle')} />
      <Notice tone="warning" className="mb-6" title={t('tools.reviewWarning')} />
      {!isAiConfigured() ? (
        <Notice tone="info" title={t('tools.unavailable')} />
      ) : (
        <LawyerTools documents={docs ?? []} matters={(matters ?? []).map((m) => ({ id: m.id, label: `${m.reference} — ${m.title}` }))} />
      )}
    </>
  )
}
