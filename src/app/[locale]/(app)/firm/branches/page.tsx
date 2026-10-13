import { Building2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { FirmDenied } from '@/features/firms/components/denied'
import { BranchForm, DepartmentForm } from '@/features/firms/components/team-forms'
import { getFirmContext } from '@/features/firms/context'
import { createClient } from '@/lib/supabase/server'

export default async function FirmBranchesPage() {
  const { firm, can } = await getFirmContext()
  if (!can('firm.settings')) return <FirmDenied />
  const t = await getTranslations('firm.branches')
  const supabase = await createClient()
  const [{ data: branches }, { data: departments }] = await Promise.all([
    supabase.from('law_firm_branches').select('*').eq('firm_id', firm.firm_id).order('created_at'),
    supabase.from('law_firm_departments').select('id, name_ar').eq('firm_id', firm.firm_id).order('name_ar'),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('title')}>
          <ul className="mb-4 space-y-2">
            {(branches ?? []).map((b) => (
              <li key={b.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <Building2 className="mt-0.5 size-4 text-gold" aria-hidden />
                <div>
                  <div className="font-semibold">
                    {b.name_ar} {b.is_headquarters ? <Badge variant="gold">{t('hq')}</Badge> : null}
                  </div>
                  <div className="text-muted-foreground">{b.address_ar}</div>
                </div>
              </li>
            ))}
            {!branches?.length ? <li className="text-sm text-muted-foreground">{t('empty')}</li> : null}
          </ul>
          <BranchForm firmId={firm.firm_id} />
        </Section>
        <Section title={t('departments')}>
          <ul className="mb-4 flex flex-wrap gap-2">
            {(departments ?? []).map((d) => (
              <li key={d.id}>
                <Badge variant="secondary">{d.name_ar}</Badge>
              </li>
            ))}
          </ul>
          <DepartmentForm firmId={firm.firm_id} />
        </Section>
      </div>
    </>
  )
}
