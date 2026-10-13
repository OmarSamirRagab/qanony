import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { FirmDenied } from '@/features/firms/components/denied'
import { RoleEditor } from '@/features/firms/components/team-forms'
import { getFirmContext } from '@/features/firms/context'
import { hasFeature, type Entitlements } from '@/lib/domain/entitlements'
import { createClient } from '@/lib/supabase/server'

export default async function FirmRolesPage() {
  const { firm, can } = await getFirmContext()
  if (!can('members.manage')) return <FirmDenied />
  const t = await getTranslations('firm.roles')
  const supabase = await createClient()
  const [{ data: roles }, { data: ent }] = await Promise.all([
    supabase.from('law_firm_roles').select('id, name, permissions').eq('firm_id', firm.firm_id).order('name'),
    supabase.rpc('my_entitlements', { p_firm_id: firm.firm_id }),
  ])
  const locked = !hasFeature(ent as unknown as Entitlements, 'firm.custom_permissions')
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {locked ? <Notice tone="info" className="mb-6" title={t('customLocked')} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {(roles ?? []).map((r) => (
          <Section key={r.id} title={r.name}>
            <RoleEditor firmId={firm.firm_id} role={r} locked={locked} />
          </Section>
        ))}
        {!locked ? (
          <Section title={t('new')}>
            <RoleEditor firmId={firm.firm_id} locked={false} />
          </Section>
        ) : null}
      </div>
    </>
  )
}
