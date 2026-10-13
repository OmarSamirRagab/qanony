import { getTranslations } from 'next-intl/server'
import { PageHeader, Section } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { CategoryDialog } from '@/features/admin/components/content-editors'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { CategoryIcon } from '@/features/reference/category-icon'
import { createClient } from '@/lib/supabase/server'

export default async function AdminCategories() {
  const ctx = await adminAccess('content.manage')
  if (!ctx) return <AccessDenied />
  const t = await getTranslations('admin.categories')
  const supabase = await createClient()
  const { data } = await supabase.from('legal_categories').select('*').order('sort_order')
  return (
    <>
      <PageHeader title={t('title')} actions={<CategoryDialog />} />
      <Section>
        <Table minWidth={600}>
          <THead>
            <Th>{t('nameAr')}</Th>
            <Th>{t('nameEn')}</Th>
            <Th>{t('slug')}</Th>
            <Th end>{t('order')}</Th>
            <Th end />
          </THead>
          <tbody>
            {(data ?? []).map((c) => (
              <Tr key={c.id}>
                <Td>
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <CategoryIcon name={c.icon} className="size-4 text-gold" /> {c.name_ar}
                    {!c.is_active ? <Badge variant="muted">{t('inactive')}</Badge> : null}
                  </span>
                </Td>
                <Td>{c.name_en}</Td>
                <Td className="text-xs">
                  <span dir="ltr">{c.slug}</span>
                </Td>
                <Td end className="tabular-nums">
                  {c.sort_order}
                </Td>
                <Td end>
                  <CategoryDialog initial={c} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  )
}
