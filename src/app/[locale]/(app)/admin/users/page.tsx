import { Users } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/shared'
import { Notice } from '@/components/shared/notices'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/card'
import { FilterBar } from '@/features/admin/components/filter-bar'
import { Table, Td, Th, THead, Tr } from '@/features/admin/components/table'
import { adminAccess } from '@/features/admin/guard'
import { FirmDenied as AccessDenied } from '@/features/firms/components/denied'
import { Link } from '@/i18n/navigation'
import { isAdmin } from '@/lib/domain/permissions'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/database'

const PAGE = 25
const ROLES = ['client', 'lawyer', 'firm_owner', 'firm_staff', 'support', 'admin', 'super_admin'] as const
const STATUSES = ['active', 'suspended', 'pending_deletion', 'deleted'] as const

type SP = { q?: string; role?: string; status?: string; page?: string }

export default async function AdminUsers({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await adminAccess('users.view')
  if (!ctx) return <AccessDenied />
  const sp = await searchParams
  const t = await getTranslations('admin.users')
  const te = await getTranslations('enums')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const page = Math.max(1, Number(sp.page) || 1)
  const role = (ROLES as readonly string[]).includes(sp.role ?? '') ? (sp.role as Enums<'app_role'>) : null
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as Enums<'account_status'>) : null
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_users', {
    p_query: sp.q?.slice(0, 100) || null,
    p_role: role,
    p_status: status,
    p_limit: PAGE,
    p_offset: (page - 1) * PAGE,
  })
  const rows = data ?? []
  const total = Number(rows[0]?.total_count ?? 0)
  return (
    <>
      <PageHeader title={t('title')} />
      {!isAdmin(ctx.roles) ? <Notice tone="info" className="mb-4" title={t('supportScope')} /> : null}
      <FilterBar
        basePath="/admin/users"
        query={sp.q}
        queryPlaceholder={t('search')}
        selects={[
          { name: 'role', label: t('role'), value: role ?? '', options: ROLES.map((r) => ({ value: r, label: te(`role.${r}`) })) },
          { name: 'status', label: t('status'), value: status ?? '', options: STATUSES.map((s) => ({ value: s, label: te(`accountStatus.${s}`) })) },
        ]}
      />
      <Section>
        {rows.length ? (
          <Table>
            <THead>
              <Th>{tc('name')}</Th>
              <Th>{tc('email')}</Th>
              <Th>{t('roles')}</Th>
              <Th>{t('joined')}</Th>
              <Th end>{t('status')}</Th>
            </THead>
            <tbody>
              {rows.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="font-semibold hover:text-gold">
                      {u.full_name || '—'}
                    </Link>
                    {u.phone ? (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {u.phone}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-xs">
                    <span dir="ltr">{u.email}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).map((r) => (
                        <Badge key={r} variant="outline">
                          {te(`role.${r}`)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{formatDate(u.created_at, locale)}</Td>
                  <Td end>
                    <StatusBadge status={u.status} label={te(`accountStatus.${u.status}`)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={Users} title={t('empty')} className="border-0" />
        )}
      </Section>
      <Pagination page={page} pageSize={PAGE} total={total} basePath="/admin/users" searchParams={sp} />
    </>
  )
}
