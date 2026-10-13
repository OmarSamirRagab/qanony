'use client'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { FIRM_PERMISSIONS } from '@/lib/domain/permissions'
import type { ActionResult } from '@/lib/action'
import { addDepartment, inviteMember, saveBranch, saveRole, setMemberOverride, updateMember } from '../actions'

type Opt = { id: string; label: string }

function useRun() {
  const te = useTranslations('errors')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<ActionResult>, done?: () => void) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) {
        const field = r.fieldErrors ? Object.values(r.fieldErrors)[0] : undefined
        return void toast.error(r.detail ?? te((field ?? r.error) as 'unknown'))
      }
      toast.success(tc('saved'))
      done?.()
      router.refresh()
    })
  return { pending, run }
}

export function InviteMemberDialog({ firmId, roles }: { firmId: string; roles: Opt[] }) {
  const t = useTranslations('firm.team')
  const te = useTranslations('enums.memberType')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: '', type: 'lawyer' as 'lawyer' | 'staff', roleId: roles[0]?.id ?? '' })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus aria-hidden /> {t('invite')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('inviteTitle')} closeLabel={tc('close')}>
        <div className="space-y-4">
          <FormField id="inv-email" label={t('email')}>
            <Input id="inv-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField id="inv-type" label={t('memberType')}>
            <NativeSelect id="inv-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'staff' })}>
              <option value="lawyer">{te('lawyer')}</option>
              <option value="staff">{te('staff')}</option>
            </NativeSelect>
          </FormField>
          <FormField id="inv-role" label={t('role')}>
            <NativeSelect id="inv-role" value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
              <option value="">{t('noRole')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <DialogFooter>
          <Button loading={pending} disabled={!f.email.includes('@')} onClick={() => run(() => inviteMember(firmId, f.email, f.type, f.roleId || null), () => setOpen(false))}>
            {t('invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MemberEditor({
  member,
  roles,
  branches,
  departments,
  overrides,
}: {
  member: { id: string; role_id: string | null; status: string; branch_id: string | null; department_id: string | null; title: string | null }
  roles: Opt[]
  branches: Opt[]
  departments: Opt[]
  overrides: Record<string, boolean>
}) {
  const t = useTranslations('firm.team')
  const tp = useTranslations('firm.roles.perm')
  const ts = useTranslations('enums.membership')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ roleId: member.role_id ?? '', status: member.status, branchId: member.branch_id ?? '', departmentId: member.department_id ?? '', title: member.title ?? '' })
  const sel = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <SlidersHorizontal aria-hidden /> {tc('edit')}
        </Button>
      </DialogTrigger>
      <DialogContent title={tc('edit')} closeLabel={tc('close')} className="max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="me-role" label={t('role')}>
            <NativeSelect id="me-role" value={f.roleId} onChange={sel('roleId')}>
              <option value="">{t('noRole')}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="me-status" label={t('status')}>
            <NativeSelect id="me-status" value={f.status} onChange={sel('status')}>
              {(member.status === 'invited' ? ['invited', 'removed'] : ['active', 'suspended', 'removed']).map((s) => (
                <option key={s} value={s}>
                  {ts(s as 'active')}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="me-branch" label={t('branch')}>
            <NativeSelect id="me-branch" value={f.branchId} onChange={sel('branchId')}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="me-dept" label={t('department')}>
            <NativeSelect id="me-dept" value={f.departmentId} onChange={sel('departmentId')}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="me-title" label={t('jobTitle')} className="sm:col-span-2">
            <Input id="me-title" value={f.title} onChange={sel('title')} />
          </FormField>
        </div>
        {f.status === 'removed' ? <p className="mt-3 text-sm text-destructive">{t('removeConfirm')}</p> : null}
        <Button
          className="mt-4"
          loading={pending}
          onClick={() =>
            run(() =>
              updateMember({ memberId: member.id, roleId: f.roleId || null, status: f.status as 'active', branchId: f.branchId || null, departmentId: f.departmentId || null, title: f.title || null }),
            )
          }
        >
          {tc('save')}
        </Button>
        <div className="mt-6 border-t pt-4">
          <div className="font-semibold">{t('overrides')}</div>
          <p className="mb-3 text-xs text-muted-foreground">{t('overridesHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIRM_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>{tp(p.replace('.', '_') as 'matters_view')}</span>
                <select
                  className="h-8 cursor-pointer rounded-md border border-input bg-card px-1 text-xs"
                  defaultValue={p in overrides ? (overrides[p] ? 'grant' : 'revoke') : 'inherit'}
                  disabled={pending}
                  onChange={(e) => run(() => setMemberOverride(member.id, p, e.target.value as 'inherit'))}
                  aria-label={p}
                >
                  <option value="inherit">{t('inherit')}</option>
                  <option value="grant">{t('grant')}</option>
                  <option value="revoke">{t('revoke')}</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}

export function RoleEditor({ firmId, role, locked }: { firmId: string; role?: { id: string; name: string; permissions: string[] }; locked: boolean }) {
  const t = useTranslations('firm.roles')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [name, setName] = useState(role?.name ?? '')
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? [])
  return (
    <div className="space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name')} aria-label={t('name')} disabled={locked} />
      <div className="grid gap-2 sm:grid-cols-2">
        {FIRM_PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <Checkbox disabled={locked} checked={perms.includes(p)} onCheckedChange={(v) => setPerms(v ? [...perms, p] : perms.filter((x) => x !== p))} />
            {t(`perm.${p.replace('.', '_') as 'matters_view'}`)}
          </label>
        ))}
      </div>
      {!locked ? (
        <Button size="sm" loading={pending} disabled={name.trim().length < 2} onClick={() => run(() => saveRole(firmId, role?.id ?? null, name, perms), () => !role && (setName(''), setPerms([])))}>
          {role ? tc('save') : t('new')}
        </Button>
      ) : null}
    </div>
  )
}

export function BranchForm({ firmId }: { firmId: string }) {
  const t = useTranslations('firm.branches')
  const { pending, run } = useRun()
  const [f, setF] = useState({ nameAr: '', addressAr: '', phone: '', isHeadquarters: false })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input placeholder={t('name')} aria-label={t('name')} value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
      <Input placeholder={t('phone')} aria-label={t('phone')} dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <Input placeholder={t('address')} aria-label={t('address')} className="sm:col-span-2" value={f.addressAr} onChange={(e) => setF({ ...f, addressAr: e.target.value })} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={f.isHeadquarters} onCheckedChange={(v) => setF({ ...f, isHeadquarters: v === true })} /> {t('hq')}
      </label>
      <div className="sm:col-span-2">
        <Button size="sm" loading={pending} disabled={f.nameAr.trim().length < 2 || f.addressAr.trim().length < 3} onClick={() => run(() => saveBranch(firmId, f), () => setF({ nameAr: '', addressAr: '', phone: '', isHeadquarters: false }))}>
          <Plus aria-hidden /> {t('add')}
        </Button>
      </div>
    </div>
  )
}

export function DepartmentForm({ firmId }: { firmId: string }) {
  const t = useTranslations('firm.branches')
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  return (
    <div className="flex gap-2">
      <Input placeholder={t('departmentName')} aria-label={t('departmentName')} value={name} onChange={(e) => setName(e.target.value)} />
      <Button size="sm" loading={pending} disabled={name.trim().length < 2} onClick={() => run(() => addDepartment(firmId, name), () => setName(''))}>
        <Plus aria-hidden /> {t('addDepartment')}
      </Button>
    </div>
  )
}
