import { getTranslations } from 'next-intl/server'
import { PageHeader, StatusBadge } from '@/components/shared'
import { Badge } from '@/components/ui/card'
import { Avatar } from '@/components/ui/primitives'
import { FirmDenied } from '@/features/firms/components/denied'
import { InviteMemberDialog, MemberEditor } from '@/features/firms/components/team-forms'
import { getFirmContext } from '@/features/firms/context'
import { createClient } from '@/lib/supabase/server'

export default async function FirmTeamPage() {
  const { ctx, firm, can } = await getFirmContext()
  if (!can('members.manage')) return <FirmDenied />
  const t = await getTranslations('firm.team')
  const te = await getTranslations('enums')
  const supabase = await createClient()
  const [{ data: members }, { data: roles }, { data: branches }, { data: departments }, { data: overrides }] = await Promise.all([
    supabase
      .from('law_firm_members')
      .select('id, user_id, invited_email, member_type, role_id, status, branch_id, department_id, title, profile:profiles!law_firm_members_user_id_fkey(full_name, avatar_url)')
      .eq('firm_id', firm.firm_id)
      .neq('status', 'removed')
      .order('created_at'),
    supabase.from('law_firm_roles').select('id, name').eq('firm_id', firm.firm_id).order('name'),
    supabase.from('law_firm_branches').select('id, name_ar').eq('firm_id', firm.firm_id),
    supabase.from('law_firm_departments').select('id, name_ar').eq('firm_id', firm.firm_id),
    supabase.from('law_firm_member_permissions').select('member_id, permission, granted'),
  ])
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]))
  const roleOpts = (roles ?? []).map((r) => ({ id: r.id, label: r.name }))
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<InviteMemberDialog firmId={firm.firm_id} roles={roleOpts} />} />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar name={m.profile?.full_name ?? m.invited_email} src={m.profile?.avatar_url} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {m.profile?.full_name ?? <span className="ltr-nums">{m.invited_email}</span>} {m.user_id === ctx.userId ? <Badge variant="outline">{t('you')}</Badge> : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {te(`memberType.${m.member_type}`)} {m.role_id ? `· ${roleName.get(m.role_id)}` : ''} {m.title ? `· ${m.title}` : ''}
              </div>
            </div>
            <StatusBadge status={m.status} label={te(`membership.${m.status}`)} />
            {m.member_type !== 'owner' ? (
              <MemberEditor
                member={m}
                roles={roleOpts}
                branches={(branches ?? []).map((b) => ({ id: b.id, label: b.name_ar }))}
                departments={(departments ?? []).map((d) => ({ id: d.id, label: d.name_ar }))}
                overrides={Object.fromEntries((overrides ?? []).filter((o) => o.member_id === m.id).map((o) => [o.permission, o.granted]))}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
