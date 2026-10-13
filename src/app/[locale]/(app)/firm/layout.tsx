import { getLocale } from 'next-intl/server'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { FirmSwitcher } from '@/features/firms/components/firm-switcher'
import { getFirmContext } from '@/features/firms/context'
import { pick } from '@/lib/utils'

export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  const { ctx, firm, permissions } = await getFirmContext()
  const locale = await getLocale()
  return (
    <DashboardShell
      portal="firm"
      ctx={ctx}
      permissions={[...permissions]}
      headerExtra={<FirmSwitcher firms={ctx.firms.map((f) => ({ id: f.firm_id, name: pick(locale, f.name, f.name_en) }))} current={firm.firm_id} />}
    >
      {children}
    </DashboardShell>
  )
}
