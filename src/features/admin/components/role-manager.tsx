'use client'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { setUserRole } from '../actions'

const ROLES = ['client', 'lawyer', 'firm_owner', 'firm_staff', 'support', 'admin', 'super_admin'] as const
type Role = (typeof ROLES)[number]
const PRIVILEGED = new Set<string>(['support', 'admin', 'super_admin'])

export function RoleManager({ userId, roles, canManage, isSuperAdmin }: { userId: string; roles: Role[]; canManage: boolean; isSuperAdmin: boolean }) {
  const t = useTranslations('admin.users')
  const te = useTranslations('enums.role')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [next, setNext] = useState('')
  const allowed = (r: string) => canManage && (!PRIVILEGED.has(r) || isSuperAdmin)
  const run = (role: string, grant: boolean) =>
    start(async () => {
      const res = await setUserRole(userId, role, grant)
      if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
      toast.success(t('updated'))
      setNext('')
      router.refresh()
    })
  const grantable = ROLES.filter((r) => !roles.includes(r) && allowed(r))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <Badge key={r} variant="outline" className="gap-1">
            {te(r)}
            {allowed(r) ? (
              <button
                type="button"
                className="cursor-pointer rounded p-0.5 hover:bg-muted"
                aria-label={`${t('revoke')}: ${te(r)}`}
                disabled={pending}
                onClick={() => run(r, false)}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </Badge>
        ))}
      </div>
      {grantable.length ? (
        <div className="flex gap-2">
          <NativeSelect value={next} onChange={(e) => setNext(e.target.value)} aria-label={t('grant')} className="w-auto min-w-40">
            <option value="">—</option>
            {grantable.map((r) => (
              <option key={r} value={r}>
                {te(r)}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" className="h-10" disabled={!next} loading={pending} onClick={() => run(next, true)}>
            {t('grant')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
