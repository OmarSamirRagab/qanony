import { DashboardShell } from '@/components/layout/dashboard-shell'
import { requirePortal } from '@/lib/auth'

export default async function LawyerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('lawyer')
  return (
    <DashboardShell portal="lawyer" ctx={ctx}>
      {children}
    </DashboardShell>
  )
}
