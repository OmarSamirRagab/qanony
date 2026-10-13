'use client'
import { Pencil, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { saveClient } from '../actions'

export interface ClientInitial {
  id: string
  full_name: string
  client_type: string
  company_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}

export function ClientDialog({ initial, firmId }: { initial?: ClientInitial; firmId?: string | null }) {
  const t = useTranslations('dashboard.clients')
  const te = useTranslations('enums.clientType')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    fullName: initial?.full_name ?? '',
    clientType: ((initial?.client_type as 'individual' | 'company') ?? 'individual') as 'individual' | 'company',
    companyName: initial?.company_name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> {tc('edit')}
          </Button>
        ) : (
          <Button variant="gold">
            <Plus aria-hidden /> {t('add')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={initial ? tc('edit') : t('add')} closeLabel={tc('close')} className="max-w-xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cl-name" label={t('name')} error={errors.fullName} required>
            <Input id="cl-name" value={f.fullName} onChange={set('fullName')} />
          </FormField>
          <FormField id="cl-type" label={t('type')}>
            <NativeSelect id="cl-type" value={f.clientType} onChange={set('clientType')}>
              <option value="individual">{te('individual')}</option>
              <option value="company">{te('company')}</option>
            </NativeSelect>
          </FormField>
          {f.clientType === 'company' ? (
            <FormField id="cl-company" label={t('company')} className="sm:col-span-2">
              <Input id="cl-company" value={f.companyName} onChange={set('companyName')} />
            </FormField>
          ) : null}
          <FormField id="cl-phone" label={tc('phone')}>
            <Input id="cl-phone" dir="ltr" type="tel" value={f.phone} onChange={set('phone')} />
          </FormField>
          <FormField id="cl-email" label={tc('email')} error={errors.email}>
            <Input id="cl-email" dir="ltr" type="email" value={f.email} onChange={set('email')} />
          </FormField>
          <FormField id="cl-address" label={t('address')} className="sm:col-span-2">
            <Input id="cl-address" value={f.address} onChange={set('address')} />
          </FormField>
          <FormField id="cl-notes" label={t('notes')} className="sm:col-span-2">
            <Textarea id="cl-notes" rows={3} value={f.notes} onChange={set('notes')} />
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
                const res = await saveClient({ ...f, id: initial?.id, firmId: firmId ?? null })
                if (!res.ok) {
                  if (res.fieldErrors) setErrors(res.fieldErrors)
                  else toast.error(terr(res.error))
                  return
                }
                toast.success(t('saved'))
                setOpen(false)
                router.refresh()
              })
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
