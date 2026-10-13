import { DashboardShell } from '@/components/layout/dashboard-shell'
import { requirePortal } from '@/lib/auth'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('client')
  return (
    <DashboardShell portal="client" ctx={ctx}>
      {children}
    </DashboardShell>
  )
}
