'use client'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { createTicket } from '../actions'

const CATEGORIES = ['account', 'booking', 'payment', 'technical', 'verification', 'other'] as const

export function NewTicketDialog({ basePath }: { basePath: string }) {
  const t = useTranslations('dashboard.support')
  const te = useTranslations('enums.ticketCategory')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ subject: '', category: 'booking' as (typeof CATEGORIES)[number], message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus aria-hidden /> {t('new')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('new')} description={t('subtitle')} closeLabel={tc('close')}>
        <div className="space-y-4">
          <FormField id="tk-subject" label={t('subject')} error={errors.subject}>
            <Input id="tk-subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </FormField>
          <FormField id="tk-cat" label={t('category')}>
            <NativeSelect id="tk-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as 'other' })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {te(c)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="tk-msg" label={t('message')} error={errors.message}>
            <Textarea id="tk-msg" rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await createTicket(f)
                if (!res.ok) {
                  if (res.fieldErrors) setErrors(res.fieldErrors)
                  else toast.error(terr(res.error))
                  return
                }
                toast.success(t('created'))
                setOpen(false)
                router.push(`${basePath}/${res.data.id}`)
              })
            }
          >
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
