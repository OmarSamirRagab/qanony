'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { cancelSubscription, resumeSubscription, startSubscription } from '../actions'

export function SubscribeButton({ planCode, firmId, trial }: { planCode: string; firmId?: string; trial: boolean }) {
  const t = useTranslations('dashboard.subscription')
  const tb = useTranslations('enums.billingCycle')
  const te = useTranslations('errors')
  const router = useRouter()
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [pending, start] = useTransition()
  return (
    <div className="flex gap-2">
      <div className="w-32">
        <NativeSelect value={cycle} onChange={(e) => setCycle(e.target.value as 'monthly')} aria-label={t('billingCycle')} className="h-10">
          <option value="monthly">{tb('monthly')}</option>
          <option value="yearly">{tb('yearly')}</option>
        </NativeSelect>
      </div>
      <Button
        variant="gold"
        className="flex-1"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await startSubscription(planCode, cycle, firmId)
            if (!res.ok) return void toast.error(res.detail ?? te(res.error))
            if (res.data.requiresPayment) router.push(`/checkout/subscription/${res.data.subscriptionId}`)
            else {
              toast.success(t('started'))
              router.refresh()
            }
          })
        }
      >
        {trial ? t('startTrial') : t('subscribe')}
      </Button>
    </div>
  )
}

export function SubscriptionActions({ id, status, cancelAtEnd }: { id: string; status: string; cancelAtEnd: boolean }) {
  const t = useTranslations('dashboard.subscription')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(te((r.error ?? 'unknown') as 'unknown'))
      toast.success(msg)
      router.refresh()
    })
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'past_due' ? (
        <Button asChild variant="gold">
          <a href={`/checkout/subscription/${id}`}>{t('renew')}</a>
        </Button>
      ) : null}
      {cancelAtEnd ? (
        <Button variant="outline" loading={pending} onClick={() => run(() => resumeSubscription(id), t('started'))}>
          {t('resume')}
        </Button>
      ) : (
        <Button variant="ghost" className="text-destructive" loading={pending} onClick={() => run(() => cancelSubscription(id), t('cancelled'))}>
          {t('cancel')}
        </Button>
      )}
    </div>
  )
}
