import { Briefcase, Building2, ShieldCheck, User } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Container } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Logo } from '@/components/layout/logo'
import { Link, redirect } from '@/i18n/navigation'
import { toLocale } from '@/i18n/routing'
import { requireUser } from '@/lib/auth'
import { defaultPortalPath, portalsFor } from '@/lib/domain/permissions'
import { createClient } from '@/lib/supabase/server'

const ICONS = { client: User, lawyer: Briefcase, firm: Building2, admin: ShieldCheck }

/** Routes users to their portal; shows a chooser when several apply. */
export default async function DashboardRedirect({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await requireUser('/dashboard')
  const { denied } = await searchParams
  const locale = await getLocale()
  if (ctx.pendingInvitations === 0) {
    const supabase = await createClient()
    await supabase.rpc('claim_firm_invitations')
  }
  const portals = portalsFor(ctx.roles, ctx.firms.length)
  if (!denied && ctx.pendingInvitations === 0) {
    redirect({ href: defaultPortalPath(ctx.roles, ctx.firms.length), locale: toLocale(locale) })
  }
  const t = await getTranslations()
  return (
    <Container className="max-w-xl py-16">
      <Logo className="mb-8" />
      {denied ? <Notice tone="warning" className="mb-6" title={t('dashboard.deniedPortal')} /> : null}
      <h1 className="mb-4 text-xl font-bold">{t('dashboard.choosePortal')}</h1>
      <div className="grid gap-3">
        {portals.map((p) => {
          const Icon = ICONS[p]
          return (
            <Link key={p} href={`/${p}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 font-semibold shadow-soft hover:border-gold/60">
              <Icon className="size-5 text-gold" aria-hidden /> {t(`nav.portal.${p}`)}
            </Link>
          )
        })}
        {ctx.pendingInvitations > 0 ? (
          <Link href="/invitations" className="rounded-xl border border-dashed p-4 text-sm font-semibold text-gold">
            {t('firm.invitations.title')} ({ctx.pendingInvitations})
          </Link>
        ) : null}
      </div>
    </Container>
  )
}
