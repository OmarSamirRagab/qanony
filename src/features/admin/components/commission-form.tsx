'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { createCommissionRule, setCommissionRuleActive } from '../actions'

const SCOPES = ['global', 'firm', 'lawyer', 'service', 'promotion'] as const
const PAYABLES = ['appointment', 'service_order', 'invoice'] as const

export function CommissionForm() {
  const t = useTranslations('admin.commissions')
  const tp = useTranslations('enums.payable')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [f, setF] = useState({ scope: 'lawyer' as (typeof SCOPES)[number], targetId: '', appliesTo: '', rate: '15', fixed: '0', startsAt: '', endsAt: '', description: '' })
  const [pending, start] = useTransition()
  const needsTarget = f.scope === 'firm' || f.scope === 'lawyer' || f.scope === 'service'
  return (
    <div className="space-y-4">
      <FormField id="cr-scope" label={t('scope')} required>
        <NativeSelect id="cr-scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as (typeof SCOPES)[number] })}>
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(`scopes.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {needsTarget ? (
        <FormField id="cr-target" label={t('target')} required error={errors.targetId}>
          <Input id="cr-target" dir="ltr" value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value.trim() })} placeholder="00000000-0000-0000-0000-000000000000" />
        </FormField>
      ) : null}
      <FormField id="cr-applies" label={t('appliesTo')}>
        <NativeSelect id="cr-applies" value={f.appliesTo} onChange={(e) => setF({ ...f, appliesTo: e.target.value })}>
          <option value="">{tc('all')}</option>
          {PAYABLES.map((p) => (
            <option key={p} value={p}>
              {tp(p)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="cr-rate" label={t('rate')} required>
          <Input id="cr-rate" type="number" min={0} max={50} step="0.01" dir="ltr" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
        </FormField>
        <FormField id="cr-fixed" label={t('fixed')}>
          <Input id="cr-fixed" type="number" min={0} step="0.01" dir="ltr" value={f.fixed} onChange={(e) => setF({ ...f, fixed: e.target.value })} />
        </FormField>
        <FormField id="cr-start" label={t('starts')}>
          <Input id="cr-start" type="date" dir="ltr" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
        </FormField>
        <FormField id="cr-end" label={t('ends')}>
          <Input id="cr-end" type="date" dir="ltr" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
        </FormField>
      </div>
      <FormField id="cr-desc" label={tc('description')}>
        <Input id="cr-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} />
      </FormField>
      <Button
        variant="gold"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await createCommissionRule({
              scope: f.scope,
              targetId: needsTarget ? f.targetId : undefined,
              appliesTo: (f.appliesTo || null) as (typeof PAYABLES)[number] | null,
              ratePercent: Number(f.rate),
              fixedEgp: Number(f.fixed) || 0,
              startsAt: f.startsAt || null,
              endsAt: f.endsAt || null,
              description: f.description,
            })
            if (!res.ok) {
              setErrors(res.fieldErrors ?? {})
              return void toast.error(res.detail ?? terr(res.fieldErrors ? 'required' : res.error))
            }
            setErrors({})
            toast.success(tc('saved'))
            router.refresh()
          })
        }
      >
        {t('add')}
      </Button>
    </div>
  )
}

export function RuleActiveSwitch({ id, active, label }: { id: string; active: boolean; label: string }) {
  const terr = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(v) =>
        start(async () => {
          const res = await setCommissionRuleActive(id, v)
          if (!res.ok) toast.error(terr(res.error))
          router.refresh()
        })
      }
    />
  )
}
