'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { savePlan } from '../actions'

export interface PlanInitial {
  id: string
  code: string
  name_ar: string
  name_en: string
  price_monthly_minor: number
  price_yearly_minor: number
  trial_days: number
  is_active: boolean
  features: { feature_key: string; enabled: boolean; limit_value: number | null }[]
}

export function PlanEditor({ plan }: { plan: PlanInitial }) {
  const t = useTranslations('admin.plans')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({
    nameAr: plan.name_ar,
    nameEn: plan.name_en,
    monthly: String(plan.price_monthly_minor / 100),
    yearly: String(plan.price_yearly_minor / 100),
    trial: String(plan.trial_days),
    active: plan.is_active,
  })
  const [features, setFeatures] = useState(plan.features.map((x) => ({ key: x.feature_key, enabled: x.enabled, limit: x.limit_value == null ? '' : String(x.limit_value) })))
  const [pending, start] = useTransition()
  const id = (s: string) => `pl-${plan.code}-${s}`
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={id('ar')} label={tc('arabic')}>
          <Input id={id('ar')} value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
        </FormField>
        <FormField id={id('en')} label={tc('english')}>
          <Input id={id('en')} dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} />
        </FormField>
        <FormField id={id('m')} label={t('monthly')}>
          <Input id={id('m')} type="number" min={0} step="1" dir="ltr" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} />
        </FormField>
        <FormField id={id('y')} label={t('yearly')}>
          <Input id={id('y')} type="number" min={0} step="1" dir="ltr" value={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.value })} />
        </FormField>
        <FormField id={id('tr')} label={t('trial')}>
          <Input id={id('tr')} type="number" min={0} max={90} dir="ltr" value={f.trial} onChange={(e) => setF({ ...f, trial: e.target.value })} />
        </FormField>
        <div className="flex items-end gap-3 pb-2">
          <Switch id={id('act')} checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
          <Label htmlFor={id('act')}>{t('active')}</Label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-start font-semibold">{t('feature')}</th>
              <th className="py-2 text-center font-semibold">{t('active')}</th>
              <th className="py-2 text-end font-semibold">{t('limit')}</th>
            </tr>
          </thead>
          <tbody>
            {features.map((x, i) => (
              <tr key={x.key} className="border-b last:border-0">
                <td className="py-1.5 font-mono text-xs" dir="ltr">
                  {x.key}
                </td>
                <td className="py-1.5 text-center">
                  <Switch checked={x.enabled} aria-label={x.key} onCheckedChange={(v) => setFeatures(features.map((y, j) => (j === i ? { ...y, enabled: v } : y)))} />
                </td>
                <td className="py-1.5 text-end">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    aria-label={`${x.key} ${t('limit')}`}
                    className="ms-auto h-8 w-24"
                    value={x.limit}
                    onChange={(e) => setFeatures(features.map((y, j) => (j === i ? { ...y, limit: e.target.value } : y)))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await savePlan({
              id: plan.id,
              nameAr: f.nameAr,
              nameEn: f.nameEn,
              monthlyEgp: Number(f.monthly),
              yearlyEgp: Number(f.yearly),
              trialDays: Number(f.trial),
              isActive: f.active,
              features: features.map((x) => ({ key: x.key, enabled: x.enabled, limit: x.limit === '' ? null : Number(x.limit) })),
            })
            if (!res.ok) return void toast.error(res.detail ?? terr(res.fieldErrors ? 'required' : res.error))
            toast.success(t('saved'))
            router.refresh()
          })
        }
      >
        {tc('save')}
      </Button>
    </div>
  )
}
