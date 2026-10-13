import { PlugZap } from 'lucide-react'
import { Notice } from './notices-client'

export { Notice }
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

export async function NotConfiguredNotice({ className }: { className?: string }) {
  const t = await getTranslations('common')
  return (
    <Notice tone="warning" title={t('notConfiguredTitle')} className={className}>
      {t('notConfiguredBody')}
    </Notice>
  )
}

export async function IntegrationPendingNotice({ provider, className }: { provider: string; className?: string }) {
  const t = await getTranslations('common')
  return (
    <div className={cn('flex gap-3 rounded-xl border border-dashed p-4 text-sm', className)}>
      <PlugZap className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div>
        <div className="font-bold">
          {t('integrationPending')} · <span className="font-mono text-xs">{provider}</span>
        </div>
        <p className="mt-0.5 text-muted-foreground">{t('integrationPendingBody')}</p>
      </div>
    </div>
  )
}

export async function LegalDisclaimer({ className }: { className?: string }) {
  const t = await getTranslations('common')
  return <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>{t('disclaimer')}</p>
}
