import { DashboardShell } from '@/components/layout/dashboard-shell'
import { requireUser } from '@/lib/auth'
import { portalsFor } from '@/lib/domain/permissions'

/** Cross-portal account pages (notifications, disputes, invitations, invoices). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser()
  const portal = portalsFor(ctx.roles, ctx.firms.length).find((p) => p !== 'admin') ?? portalsFor(ctx.roles, ctx.firms.length)[0] ?? 'client'
  return (
    <DashboardShell portal={portal} ctx={ctx}>
      {children}
    </DashboardShell>
  )
}
