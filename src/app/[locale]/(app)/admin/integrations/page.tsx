import { CheckCircle2, CircleDashed } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { integrationStatuses } from '@/lib/providers/status'

export const dynamic = 'force-dynamic'

export default async function AdminIntegrations() {
  const ctx = await adminAccess('settings.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.integrations')
  const statuses = integrationStatuses()
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-4 md:grid-cols-2">
        {statuses.map((s) => (
          <Section key={s.key}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {s.configured ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <CircleDashed className="size-5 text-muted-foreground" aria-hidden />}
                <h2 className="font-bold">{t(s.key)}</h2>
              </div>
              <Badge variant={s.configured ? 'success' : 'muted'}>{s.configured ? t('configured') : t('missing')}</Badge>
            </div>
            {s.mode ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('mode')}: <span dir="ltr">{s.mode}</span>
              </p>
            ) : null}
            <p className={s.verified ? 'mt-2 text-xs text-success' : 'mt-2 text-xs text-warning'}>{s.verified ? t('verified') : t('unverified')}</p>
            <div className="mt-3 text-xs">
              <div className="mb-1 font-semibold text-muted-foreground">{t('envVars')}</div>
              <div className="flex flex-wrap gap-1" dir="ltr">
                {s.env.map((e) => (
                  <code key={e} className="rounded bg-muted px-1.5 py-0.5">
                    {e}
                  </code>
                ))}
              </div>
            </div>
          </Section>
        ))}
      </div>
    </>
  )
}
