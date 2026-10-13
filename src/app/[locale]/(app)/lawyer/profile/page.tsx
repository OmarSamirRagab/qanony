import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/shared'
import { ProfileEditor } from '@/features/lawyer-portal/components/profile-editor'
import { getCategories, getCities, getGovernorates } from '@/features/reference/queries'
import { requirePortal } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { pick } from '@/lib/utils'

export default async function LawyerProfilePage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard.profile')
  const locale = await getLocale()
  const supabase = await createClient()
  const [{ data: profile }, { data: specs }, { data: offerings }, { data: offices }, governorates, cities, categories] = await Promise.all([
    supabase.from('lawyer_profiles').select('*').eq('id', ctx.userId).single(),
    supabase.from('lawyer_specializations').select('category_id, is_primary').eq('lawyer_id', ctx.userId),
    supabase.from('lawyer_consultation_offerings').select('consultation_type, price_minor, duration_minutes, is_active').eq('lawyer_id', ctx.userId),
    supabase.from('lawyer_offices').select('id, label, address_ar, address_en, map_url').eq('lawyer_id', ctx.userId).eq('is_active', true),
    getGovernorates(),
    getCities(),
    getCategories(),
  ])
  if (!profile) return null
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ProfileEditor
        userId={ctx.userId}
        profile={{ ...profile, education: (Array.isArray(profile.education) ? profile.education : []) as { degree: string; institution: string; year: number | null }[] }}
        governorates={governorates.map((g) => ({ id: g.id, name: pick(locale, g.name_ar, g.name_en) }))}
        cities={cities.map((c) => ({ id: c.id, governorateId: c.governorate_id, name: pick(locale, c.name_ar, c.name_en) }))}
        categories={categories.map((c) => ({ id: c.id, name: pick(locale, c.name_ar, c.name_en) }))}
        specializations={(specs ?? []).map((s) => ({ categoryId: s.category_id, primary: s.is_primary }))}
        offerings={(offerings ?? []).map((o) => ({ type: o.consultation_type, enabled: o.is_active, price: o.price_minor / 100, duration: o.duration_minutes }))}
        offices={offices ?? []}
        firms={ctx.firms.filter((f) => f.member_type !== 'staff').map((f) => ({ id: f.firm_id, name: pick(locale, f.name, f.name_en) }))}
      />
    </>
  )
}
