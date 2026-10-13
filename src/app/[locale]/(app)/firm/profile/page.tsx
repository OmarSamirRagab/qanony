import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section, StatusBadge } from '@/components/shared'
import { FirmDenied } from '@/features/firms/components/denied'
import { FirmProfileForm } from '@/features/firms/components/firm-profile-form'
import { getFirmContext } from '@/features/firms/context'
import { getGovernorates } from '@/features/reference/queries'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function FirmProfilePage() {
  const { firm, can } = await getFirmContext()
  if (!can('firm.settings')) return <FirmDenied />
  const t = await getTranslations('firm.profile')
  const te = await getTranslations('enums.verification')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data }, governorates] = await Promise.all([supabase.from('law_firms').select('*').eq('id', firm.firm_id).single(), getGovernorates()])
  if (!data) return <FirmDenied />
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<StatusBadge status={data.verification_status} label={`${t('verification')}: ${te(data.verification_status)}`} />} />
      <Section>
        <FirmProfileForm firmId={firm.firm_id} initial={data} verified={data.verification_status === 'verified'} governorates={governorates.map((g) => ({ id: g.id, name: pick(locale, g.name_ar, g.name_en) }))} />
      </Section>
    </>
  )
}
