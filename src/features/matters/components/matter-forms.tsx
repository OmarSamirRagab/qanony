'use client'
import { Pencil, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'
import { MATTER_TRANSITIONS, type MatterStatus } from '@/lib/domain/status'
import { addExpense, assignMember, changeMatterStatus, createMatter, removeMember, saveHearing, saveTask, setTaskStatus, updateMatter } from '../actions'

type Option = { id: string; label: string }

function useRun() {
  const router = useRouter()
  const te = useTranslations('errors')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<ActionResult<unknown>>, success: string, after?: (r: ActionResult<unknown>) => void) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.detail ?? te(res.error))
        return
      }
      toast.success(success)
      after?.(res)
      router.refresh()
    })
  return { pending, run, router }
}

/** Datetime-local value in Cairo time → ISO string with +02/+03 offset handled by the browser. */
function localToIso(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}
function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MatterForm({
  mode,
  initial,
  clients,
  categories,
  lawyers,
  firmId,
  basePath,
}: {
  mode: 'create' | 'edit'
  initial?: { id: string; title: string; description: string | null; priority: string; category_id: string | null; client_record_id: string | null; opposing_party: string | null; billing_type: string; agreed_fee_minor: number | null; ai_enabled: boolean }
  clients: Option[]
  categories: Option[]
  lawyers?: Option[]
  firmId?: string | null
  basePath: string
}) {
  const t = useTranslations('matters')
  const te = useTranslations('enums')
  const tc = useTranslations('common')
  const { pending, run, router } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: initial?.priority ?? 'normal',
    categoryId: initial?.category_id ?? '',
    clientRecordId: initial?.client_record_id ?? '',
    opposingParty: initial?.opposing_party ?? '',
    billingType: initial?.billing_type ?? 'fixed',
    agreedFee: initial?.agreed_fee_minor != null ? String(initial.agreed_fee_minor / 100) : '',
    aiEnabled: initial?.ai_enabled ?? false,
    ownerLawyerId: lawyers?.[0]?.id ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const payload = {
    title: f.title,
    description: f.description,
    priority: f.priority as 'normal',
    categoryId: f.categoryId || null,
    clientRecordId: f.clientRecordId || null,
    opposingParty: f.opposingParty,
    billingType: f.billingType as 'fixed',
    agreedFee: f.agreedFee ? Number(f.agreedFee) : null,
    aiEnabled: f.aiEnabled,
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button variant="gold">
            <Plus aria-hidden /> {t('new')}
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> {tc('edit')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={mode === 'create' ? t('newTitle') : tc('edit')} closeLabel={tc('close')} className="max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="m-title" label={t('titleField')} className="sm:col-span-2" required>
            <Input id="m-title" value={f.title} onChange={set('title')} maxLength={200} />
          </FormField>
          <FormField id="m-client" label={t('client')}>
            <NativeSelect id="m-client" value={f.clientRecordId} onChange={set('clientRecordId')}>
              <option value="">{t('noClient')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {mode === 'create' && lawyers?.length ? (
            <FormField id="m-lead" label={t('lead')}>
              <NativeSelect id="m-lead" value={f.ownerLawyerId} onChange={set('ownerLawyerId')}>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          <FormField id="m-cat" label={t('category')}>
            <NativeSelect id="m-cat" value={f.categoryId} onChange={set('categoryId')}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="m-prio" label={t('priority')}>
            <NativeSelect id="m-prio" value={f.priority} onChange={set('priority')}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                <option key={p} value={p}>
                  {te(`priority.${p}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="m-opp" label={t('opposingParty')}>
            <Input id="m-opp" value={f.opposingParty} onChange={set('opposingParty')} />
          </FormField>
          <FormField id="m-bill" label={t('billingType')}>
            <NativeSelect id="m-bill" value={f.billingType} onChange={set('billingType')}>
              {(['fixed', 'hourly', 'retainer', 'pro_bono'] as const).map((b) => (
                <option key={b} value={b}>
                  {te(`billingType.${b}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="m-fee" label={t('agreedFee')}>
            <Input id="m-fee" type="number" min={0} inputMode="decimal" value={f.agreedFee} onChange={set('agreedFee')} />
          </FormField>
          <FormField id="m-desc" label={t('description')} className="sm:col-span-2">
            <Textarea id="m-desc" rows={4} value={f.description} onChange={set('description')} maxLength={10000} />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={f.aiEnabled} onCheckedChange={(v) => setF((s) => ({ ...s, aiEnabled: v === true }))} /> {t('aiEnabled')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={f.title.trim().length < 3}
            onClick={() =>
              mode === 'create'
                ? run(
                    () => createMatter({ ...payload, firmId: firmId ?? null, ownerLawyerId: f.ownerLawyerId || null }),
                    t('created'),
                    (r) => {
                      setOpen(false)
                      if (r.ok && r.data && typeof r.data === 'object' && 'id' in r.data) router.push(`${basePath}/${(r.data as { id: string }).id}`)
                    },
                  )
                : run(() => updateMatter({ id: initial!.id, ...payload }), t('saved'), () => setOpen(false))
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MatterStatusChanger({ matterId, status }: { matterId: string; status: MatterStatus }) {
  const t = useTranslations('matters')
  const te = useTranslations('enums.matter')
  const { pending, run } = useRun()
  const next = MATTER_TRANSITIONS[status]
  if (!next.length) return null
  return (
    <div className="w-56">
      <select
        className="h-9 w-full cursor-pointer rounded-lg border border-input bg-card px-2 text-sm"
        aria-label={t('changeStatus')}
        disabled={pending}
        value=""
        onChange={(e) => {
          const to = e.target.value
          if (to) run(() => changeMatterStatus(matterId, to), t('statusChanged'))
        }}
      >
        <option value="">{t('changeStatus')}…</option>
        {next.map((s) => (
          <option key={s} value={s}>
            {te(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

export function TaskDialog({ matterId, members, task }: { matterId: string; members: Option[]; task?: { id: string; title: string; description: string | null; assignee_id: string | null; due_at: string | null; status: string; priority: string } }) {
  const t = useTranslations('matters.tasks')
  const te = useTranslations('enums')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    assigneeId: task?.assignee_id ?? '',
    dueAt: isoToLocal(task?.due_at),
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'normal',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {task ? (
          <Button variant="ghost" size="icon-sm" aria-label={tc('edit')}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> {t('add')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={task ? tc('edit') : t('add')} closeLabel={tc('close')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="t-title" label={t('title')} className="sm:col-span-2" required>
            <Input id="t-title" value={f.title} onChange={set('title')} maxLength={200} />
          </FormField>
          <FormField id="t-assignee" label={t('assignee')}>
            <NativeSelect id="t-assignee" value={f.assigneeId} onChange={set('assigneeId')}>
              <option value="">{t('unassigned')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="t-due" label={t('due')}>
            <Input id="t-due" type="datetime-local" value={f.dueAt} onChange={set('dueAt')} />
          </FormField>
          <FormField id="t-status" label={t('status')}>
            <NativeSelect id="t-status" value={f.status} onChange={set('status')}>
              {(['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const).map((s) => (
                <option key={s} value={s}>
                  {te(`taskStatus.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="t-prio" label={t('priority')}>
            <NativeSelect id="t-prio" value={f.priority} onChange={set('priority')}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                <option key={p} value={p}>
                  {te(`priority.${p}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="t-desc" label={tc('description')} className="sm:col-span-2">
            <Textarea id="t-desc" rows={3} value={f.description} onChange={set('description')} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={f.title.trim().length < 2}
            onClick={() =>
              run(
                () =>
                  saveTask({
                    id: task?.id,
                    matterId,
                    title: f.title,
                    description: f.description,
                    assigneeId: f.assigneeId || null,
                    dueAt: localToIso(f.dueAt),
                    status: f.status as 'todo',
                    priority: f.priority as 'normal',
                  }),
                t('saved'),
                () => setOpen(false),
              )
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TaskStatusSelect({ taskId, status }: { taskId: string; status: string }) {
  const te = useTranslations('enums.taskStatus')
  const t = useTranslations('matters.tasks')
  const { pending, run } = useRun()
  return (
    <select
      className="h-8 cursor-pointer rounded-md border border-input bg-card px-2 text-xs"
      value={status}
      disabled={pending}
      aria-label={t('status')}
      onChange={(e) => run(() => setTaskStatus(taskId, e.target.value as 'done'), t('saved'))}
    >
      {(['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const).map((s) => (
        <option key={s} value={s}>
          {te(s)}
        </option>
      ))}
    </select>
  )
}

export function HearingDialog({
  matterId,
  lawyers,
  hearing,
}: {
  matterId: string
  lawyers: Option[]
  hearing?: { id: string; court_name: string; court_location: string | null; circuit: string | null; case_number: string | null; hearing_at: string; assigned_lawyer_id: string | null; purpose: string | null; notes: string | null; outcome: string | null; next_hearing_at: string | null; visible_to_client: boolean }
}) {
  const t = useTranslations('matters.hearings')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    courtName: hearing?.court_name ?? '',
    courtLocation: hearing?.court_location ?? '',
    circuit: hearing?.circuit ?? '',
    caseNumber: hearing?.case_number ?? '',
    hearingAt: isoToLocal(hearing?.hearing_at),
    assignedLawyerId: hearing?.assigned_lawyer_id ?? lawyers[0]?.id ?? '',
    purpose: hearing?.purpose ?? '',
    notes: hearing?.notes ?? '',
    outcome: hearing?.outcome ?? '',
    nextHearingAt: isoToLocal(hearing?.next_hearing_at),
    visibleToClient: hearing?.visible_to_client ?? true,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {hearing ? (
          <Button variant="ghost" size="icon-sm" aria-label={tc('edit')}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden /> {t('add')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={hearing ? tc('edit') : t('add')} description={t('manualNote')} closeLabel={tc('close')} className="max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="h-court" label={t('court')} required>
            <Input id="h-court" value={f.courtName} onChange={set('courtName')} />
          </FormField>
          <FormField id="h-loc" label={t('location')}>
            <Input id="h-loc" value={f.courtLocation} onChange={set('courtLocation')} />
          </FormField>
          <FormField id="h-circuit" label={t('circuit')}>
            <Input id="h-circuit" value={f.circuit} onChange={set('circuit')} />
          </FormField>
          <FormField id="h-case" label={t('caseNumber')}>
            <Input id="h-case" value={f.caseNumber} onChange={set('caseNumber')} />
          </FormField>
          <FormField id="h-date" label={t('date')} required>
            <Input id="h-date" type="datetime-local" value={f.hearingAt} onChange={set('hearingAt')} />
          </FormField>
          <FormField id="h-lawyer" label={t('lawyer')}>
            <NativeSelect id="h-lawyer" value={f.assignedLawyerId} onChange={set('assignedLawyerId')}>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="h-purpose" label={t('purpose')} className="sm:col-span-2">
            <Input id="h-purpose" value={f.purpose} onChange={set('purpose')} />
          </FormField>
          <FormField id="h-notes" label={t('notes')} className="sm:col-span-2">
            <Textarea id="h-notes" rows={2} value={f.notes} onChange={set('notes')} />
          </FormField>
          <FormField id="h-outcome" label={t('outcome')} className="sm:col-span-2">
            <Textarea id="h-outcome" rows={2} value={f.outcome} onChange={set('outcome')} />
          </FormField>
          <FormField id="h-next" label={t('nextHearing')}>
            <Input id="h-next" type="datetime-local" value={f.nextHearingAt} onChange={set('nextHearingAt')} />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={f.visibleToClient} onCheckedChange={(v) => setF((s) => ({ ...s, visibleToClient: v === true }))} /> {t('visibleToClient')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={!f.courtName.trim() || !f.hearingAt}
            onClick={() =>
              run(
                () =>
                  saveHearing({
                    id: hearing?.id,
                    matterId,
                    courtName: f.courtName,
                    courtLocation: f.courtLocation,
                    circuit: f.circuit,
                    caseNumber: f.caseNumber,
                    hearingAt: localToIso(f.hearingAt)!,
                    assignedLawyerId: f.assignedLawyerId || null,
                    purpose: f.purpose,
                    notes: f.notes,
                    outcome: f.outcome,
                    nextHearingAt: localToIso(f.nextHearingAt),
                    visibleToClient: f.visibleToClient,
                  }),
                t('saved'),
                () => setOpen(false),
              )
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExpenseDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.expenses')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ description: '', amount: '', incurredOn: new Date().toISOString().slice(0, 10), billable: true })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden /> {t('add')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('add')} closeLabel={tc('close')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="e-desc" label={t('description')} className="sm:col-span-2" required>
            <Input id="e-desc" value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} />
          </FormField>
          <FormField id="e-amount" label={t('amount')} required>
            <Input id="e-amount" type="number" min={0} inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
          </FormField>
          <FormField id="e-date" label={t('date')}>
            <Input id="e-date" type="date" value={f.incurredOn} onChange={(e) => setF((s) => ({ ...s, incurredOn: e.target.value }))} />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={f.billable} onCheckedChange={(v) => setF((s) => ({ ...s, billable: v === true }))} /> {t('billable')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={!f.description.trim() || !(Number(f.amount) > 0)}
            onClick={() => run(() => addExpense({ matterId, description: f.description, amount: Number(f.amount), incurredOn: f.incurredOn, billable: f.billable }), t('saved'), () => setOpen(false))}
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MemberAssign({ matterId, candidates }: { matterId: string; candidates: Option[] }) {
  const t = useTranslations('matters.team')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<'lead' | 'associate' | 'staff'>('associate')
  const [canEdit, setCanEdit] = useState(true)
  if (!candidates.length) return null
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={t('member')} className="h-9">
          <option value="">{t('member')}…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="w-36">
        <NativeSelect value={role} onChange={(e) => setRole(e.target.value as 'associate')} aria-label={t('role')} className="h-9">
          {(['lead', 'associate', 'staff'] as const).map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={canEdit} onCheckedChange={(v) => setCanEdit(v === true)} /> {t('canEdit')}
      </label>
      <Button size="sm" disabled={!userId} loading={pending} onClick={() => run(() => assignMember(matterId, userId, role, canEdit), t('added'), () => setUserId(''))}>
        <Plus aria-hidden /> {tc('add')}
      </Button>
    </div>
  )
}

export function RemoveMemberButton({ matterId, userId }: { matterId: string; userId: string }) {
  const t = useTranslations('matters.team')
  const tc = useTranslations('common')
  const { pending, run } = useRun()
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => removeMember(matterId, userId), t('removed'))}>
      {tc('remove')}
    </Button>
  )
}
