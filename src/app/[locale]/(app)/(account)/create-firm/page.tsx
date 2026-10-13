import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { CreateFirmForm } from '@/features/firms/components/create-firm-form'
import { getGovernorates } from '@/features/reference/queries'
import { redirect } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { requireUser } from '@/lib/auth'
import { pick } from '@/lib/utils'

export default async function CreateFirmPage() {
  const ctx = await requireUser('/create-firm')
  const locale = toLocale(await getLocale())
  if (!ctx.roles.includes('lawyer')) redirect({ href: '/register/lawyer?firm=1', locale })
  const t = await getTranslations('firm.create')
  const governorates = await getGovernorates()
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Section className="max-w-2xl">
        <CreateFirmForm governorates={governorates.map((g) => ({ id: g.id, name: pick(locale, g.name_ar, g.name_en) }))} />
      </Section>
    </>
  )
}
