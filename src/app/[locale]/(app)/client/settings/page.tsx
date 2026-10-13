import { SettingsPage } from '@/features/settings/components/settings-page'
import { requirePortal } from '@/lib/auth'

export default async function ClientSettingsPage() {
  const ctx = await requirePortal('client')
  return <SettingsPage userId={ctx.userId} />
}
