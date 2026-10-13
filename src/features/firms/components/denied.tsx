import { ShieldX } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/shared'

export async function FirmDenied() {
  const t = await getTranslations('common')
  return <EmptyState icon={ShieldX} title={t('accessDenied')} />
}
