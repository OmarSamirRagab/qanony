'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'

/**
 * A button that opens a confirmation dialog collecting a documented reason (or
 * another single text value, e.g. a transfer reference) before running a
 * server action. Used for every consequential admin decision.
 */
export function ReasonAction({
  label,
  title,
  description,
  fieldLabel,
  action,
  success,
  variant = 'outline',
  size = 'sm',
  minLength = 3,
  amount,
  singleLine = false,
}: {
  label: string
  title: string
  description?: string
  fieldLabel: string
  action: (value: string, amount?: number) => Promise<ActionResult<unknown>>
  success: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  minLength?: number
  /** When set, the dialog also collects an amount in EGP (max = this value). */
  amount?: { label: string; max: number }
  singleLine?: boolean
}) {
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [amt, setAmt] = useState(amount ? String(amount.max) : '')
  const [pending, start] = useTransition()
  const amountValid = !amount || (Number(amt) > 0 && Number(amt) <= amount.max)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description} closeLabel={tc('close')}>
        <div className="space-y-4">
          {amount ? (
            <FormField id="ra-amount" label={amount.label} required>
              <Input id="ra-amount" type="number" inputMode="decimal" min={0} max={amount.max} step="0.01" dir="ltr" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </FormField>
          ) : null}
          <FormField id="ra-value" label={fieldLabel} required>
            {singleLine ? (
              <Input id="ra-value" value={value} onChange={(e) => setValue(e.target.value)} dir="auto" />
            ) : (
              <Textarea id="ra-value" rows={4} value={value} onChange={(e) => setValue(e.target.value)} maxLength={1000} />
            )}
          </FormField>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            loading={pending}
            disabled={value.trim().length < minLength || !amountValid}
            onClick={() =>
              start(async () => {
                const res = await action(value.trim(), amount ? Number(amt) : undefined)
                if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
                toast.success(success)
                setOpen(false)
                setValue('')
                router.refresh()
              })
            }
          >
            {tc('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Immediate (no-reason) action button, e.g. approving a pending service. */
export function QuickAction({
  label,
  action,
  success,
  variant = 'outline',
  size = 'sm',
}: {
  label: string
  action: () => Promise<ActionResult<unknown>>
  success: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}) {
  const terr = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await action()
          if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
          toast.success(success)
          router.refresh()
        })
      }
    >
      {label}
    </Button>
  )
}
