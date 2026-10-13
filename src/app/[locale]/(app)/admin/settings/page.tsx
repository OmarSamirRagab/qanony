import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { SettingEditor } from '@/features/admin/components/setting-editor'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { canEditSetting } from '@/lib/domain/permissions'
import { formatDateTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function AdminSettings() {
  const ctx = await adminAccess('settings.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.settings')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase.from('platform_settings').select('*').order('key')
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-6 xl:grid-cols-2">
        {(data ?? []).map((s) => {
          const editable = canEditSetting(ctx.roles, s.key)
          return (
            <Section
              key={s.key}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-mono text-sm">
                    {s.key}
                  </span>
                  {s.is_public ? <Badge variant="info">{t('public')}</Badge> : null}
                  {!editable ? <Badge variant="warning">{t('superOnly')}</Badge> : null}
                </span>
              }
              description={
                <>
                  {s.description ? `${s.description} · ` : ''}
                  {tc('updatedAt')}: {formatDateTime(s.updated_at, locale)}
                </>
              }
            >
              <SettingEditor settingKey={s.key} value={s.value} isPublic={s.is_public} disabled={!editable} />
            </Section>
          )
        })}
        <Section title={tc('add')}>
          <SettingEditor />
        </Section>
      </div>
    </>
  )
}
