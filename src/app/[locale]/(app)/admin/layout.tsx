import { DashboardShell } from '@/components/layout/dashboard-shell'
import { requirePortal } from '@/lib/auth'
import { platformPermissions } from '@/lib/domain/permissions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('admin')
  return (
    <DashboardShell portal="admin" ctx={ctx} permissions={[...platformPermissions(ctx.roles)]}>
      {children}
    </DashboardShell>
  )
}
