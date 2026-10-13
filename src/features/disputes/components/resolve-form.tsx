'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { resolveDispute } from '../actions'

const TYPES = ['full_refund', 'partial_refund', 'no_refund', 'completed', 'cancelled'] as const

export function ResolveDisputeForm({ id }: { id: string }) {
  const t = useTranslations('dashboard.disputes')
  const te = useTranslations('enums.resolution')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [type, setType] = useState<(typeof TYPES)[number]>('no_refund')
  const [percent, setPercent] = useState('50')
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  return (
    <div className="space-y-3">
      <FormField id="r-type" label={t('resolution')}>
        <NativeSelect id="r-type" value={type} onChange={(e) => setType(e.target.value as 'no_refund')}>
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {te(x)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {type === 'partial_refund' ? (
        <FormField id="r-pct" label="%">
          <Input id="r-pct" type="number" min={1} max={99} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </FormField>
      ) : null}
      <FormField id="r-text" label={tc('notes')}>
        <Textarea id="r-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </FormField>
      <Button
        className="w-full"
        loading={pending}
        disabled={text.trim().length < 5}
        onClick={() =>
          start(async () => {
            const res = await resolveDispute({ id, type, percent: Number(percent), resolution: text })
            if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
            toast.success(tc('saved'))
            router.refresh()
          })
        }
      >
        {tc('confirm')}
      </Button>
    </div>
  )
}
