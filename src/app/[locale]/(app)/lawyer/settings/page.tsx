import { SettingsPage } from '@/features/settings/components/settings-page'
import { requirePortal } from '@/lib/auth'

export default async function LawyerSettingsPage() {
  const ctx = await requirePortal('lawyer')
  return <SettingsPage userId={ctx.userId} />
}
