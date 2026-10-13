import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { DescriptionList, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Breadcrumbs } from '@/components/shared/server'
import { ReasonAction } from '@/features/admin/components/reason-action'
import { RoleManager } from '@/features/admin/components/role-manager'
import { adminAccess } from '@/features/admin/guard'
import { setAccountStatus } from '@/features/admin/actions'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { isAdmin } from '@/lib/domain/permissions'
import { formatDate, formatDateTime } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminAccess('users.view')
  if (!ctx) return <AccessDenied />
  const { id } = await params
  const t = await getTranslations('admin.users')
  const tn = await getTranslations('nav.admin')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const supabase = await createClient()
  // RLS: profiles/user_roles are readable by platform staff only (or self).
  const [{ data: profile }, { data: roles }, { data: lawyer }, { count: appointments }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', id),
    supabase.from('lawyer_profiles').select('slug, verification_status, is_published').eq('id', id).maybeSingle(),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).or(`client_id.eq.${id},lawyer_id.eq.${id}`),
  ])
  if (!profile) notFound()
  // Email lives in auth.users; read only after the staff-scoped profile read above succeeded.
  const { data: auth } = await createAdminClient().auth.admin.getUserById(id)
  const admin = isAdmin(ctx.roles)
  const self = ctx.userId === id
  const userRoles = (roles ?? []).map((r) => r.role)
  async function suspend(reason: string) {
    'use server'
    return setAccountStatus(id, 'suspended', reason)
  }
  async function reactivate(reason: string) {
    'use server'
    return setAccountStatus(id, 'active', reason)
  }
  return (
    <>
      <Breadcrumbs items={[{ label: tn('users'), href: '/admin/users' }, { label: profile.full_name || id }]} />
      <PageHeader
        title={profile.full_name || '—'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={profile.status} label={te(`accountStatus.${profile.status}`)} />
            {admin && !self && profile.status === 'active' ? (
              <ReasonAction label={t('suspend')} title={t('suspend')} fieldLabel={t('reason')} action={suspend} success={t('updated')} variant="destructive" />
            ) : null}
            {admin && !self && profile.status === 'suspended' ? (
              <ReasonAction label={t('reactivate')} title={t('reactivate')} fieldLabel={t('reason')} action={reactivate} success={t('updated')} />
            ) : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section>
          <DescriptionList
            items={[
              { label: tc('email'), value: <span dir="ltr">{auth.user?.email ?? '—'}</span> },
              { label: tc('phone'), value: <span dir="ltr">{profile.phone ?? '—'}</span> },
              { label: tc('language'), value: profile.locale === 'ar' ? tc('arabic') : tc('english') },
              { label: t('joined'), value: formatDate(profile.created_at, locale) },
              { label: t('lastSignIn'), value: auth.user?.last_sign_in_at ? formatDateTime(auth.user.last_sign_in_at, locale) : '—' },
              { label: tn('appointments'), value: appointments ?? 0 },
              ...(profile.suspended_reason ? [{ label: t('reason'), value: profile.suspended_reason }] : []),
              ...(lawyer
                ? [
                    {
                      label: te('role.lawyer'),
                      value: (
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={lawyer.verification_status} label={te(`verification.${lawyer.verification_status}`)} />
                          {lawyer.is_published ? (
                            <Link href={`/lawyers/${lawyer.slug}`} className="text-gold hover:underline">
                              /lawyers/{lawyer.slug}
                            </Link>
                          ) : null}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
        <Section title={t('roles')}>
          <RoleManager userId={id} roles={userRoles} canManage={admin} isSuperAdmin={ctx.roles.includes('super_admin')} />
        </Section>
      </div>
    </>
  )
}
