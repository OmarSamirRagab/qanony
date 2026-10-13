'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { addSettlementAccount, requestPayout } from '../actions'

export function PayoutForm({ firmId, disabled }: { firmId?: string | null; disabled?: boolean }) {
  const t = useTranslations('payments.finance')
  const te = useTranslations('errors')
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField id="po-amount" label={t('payoutAmount')}>
        <Input id="po-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" />
      </FormField>
      <Button
        disabled={disabled || !(Number(amount) > 0)}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await requestPayout(Number(amount), firmId)
            if (!res.ok) return void toast.error(te(res.error))
            toast.success(t('payoutRequested'))
            setAmount('')
            router.refresh()
          })
        }
      >
        {t('requestPayout')}
      </Button>
    </div>
  )
}

export function SettlementAccountForm({ firmId }: { firmId?: string | null }) {
  const t = useTranslations('payments.finance')
  const tm = useTranslations('enums.settlementMethod')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({ method: 'bank_transfer' as 'bank_transfer' | 'instapay' | 'mobile_wallet', holder: '', bank: '', identifier: '' })
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField id="sa-method" label={t('method')}>
        <NativeSelect id="sa-method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as 'instapay' })}>
          {(['bank_transfer', 'instapay', 'mobile_wallet'] as const).map((m) => (
            <option key={m} value={m}>
              {tm(m)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="sa-holder" label={t('accountHolder')}>
        <Input id="sa-holder" value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} />
      </FormField>
      {f.method === 'bank_transfer' ? (
        <FormField id="sa-bank" label={t('bankName')}>
          <Input id="sa-bank" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} />
        </FormField>
      ) : null}
      <FormField id="sa-id" label={t('accountIdentifier')}>
        <Input id="sa-id" dir="ltr" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} />
      </FormField>
      <div className="sm:col-span-2">
        <Button
          variant="outline"
          loading={pending}
          disabled={f.holder.trim().length < 3 || f.identifier.trim().length < 6}
          onClick={() =>
            start(async () => {
              const res = await addSettlementAccount({ ...f, firmId })
              if (!res.ok) return void toast.error(te(res.error))
              toast.success(tc('saved'))
              setF({ method: 'bank_transfer', holder: '', bank: '', identifier: '' })
              router.refresh()
            })
          }
        >
          {t('addAccount')}
        </Button>
      </div>
    </div>
  )
}
