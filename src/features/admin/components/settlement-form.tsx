'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { createSettlement } from '../actions'

export interface Beneficiary {
  key: string
  label: string
  lawyerId: string | null
  firmId: string | null
}

/** Prepares a settlement for a beneficiary from their ledger balance. */
export function SettlementForm({ beneficiaries, defaultStart, defaultEnd }: { beneficiaries: Beneficiary[]; defaultStart: string; defaultEnd: string }) {
  const t = useTranslations('admin.settlements')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({ key: '', start: defaultStart, end: defaultEnd })
  const [pending, start] = useTransition()
  const b = beneficiaries.find((x) => x.key === f.key)
  return (
    <div className="space-y-4">
      <FormField id="st-b" label={t('beneficiary')} required>
        <NativeSelect id="st-b" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>
          <option value="">—</option>
          {beneficiaries.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="st-from" label={t('periodStart')}>
          <Input id="st-from" type="date" dir="ltr" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </FormField>
        <FormField id="st-to" label={t('periodEnd')}>
          <Input id="st-to" type="date" dir="ltr" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </FormField>
      </div>
      <Button
        variant="gold"
        disabled={!b}
        loading={pending}
        onClick={() =>
          start(async () => {
            if (!b) return
            const res = await createSettlement({ lawyerId: b.lawyerId, firmId: b.firmId, periodStart: f.start, periodEnd: f.end })
            if (!res.ok) return void toast.error(res.detail ?? terr(res.fieldErrors ? (Object.values(res.fieldErrors)[0] as 'required') : res.error))
            toast.success(t('created'))
            setF({ ...f, key: '' })
            router.refresh()
          })
        }
      >
        {t('create')}
      </Button>
    </div>
  )
}
