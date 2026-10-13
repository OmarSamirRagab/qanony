'use client'
import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { submitContact } from '../actions'

export function ContactForm() {
  const t = useTranslations('content.contact')
  const te = useTranslations('errors')
  const [f, setF] = useState({ name: '', email: '', phone: '', subject: '', message: '', website: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  if (sent)
    return (
      <div className="rounded-2xl border bg-card p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <p className="mt-3">{t('sent')}</p>
      </div>
    )
  return (
    <form
      className="grid gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await submitContact(f)
          if (!res.ok) {
            if (res.fieldErrors) setErrors(res.fieldErrors)
            else toast.error(te(res.error))
            return
          }
          setSent(true)
        })
      }}
    >
      <FormField id="c-name" label={t('name')} error={errors.name} required>
        <Input id="c-name" value={f.name} onChange={set('name')} autoComplete="name" />
      </FormField>
      <FormField id="c-email" label={t('email')} error={errors.email} required>
        <Input id="c-email" type="email" dir="ltr" value={f.email} onChange={set('email')} autoComplete="email" />
      </FormField>
      <FormField id="c-phone" label={t('phone')}>
        <Input id="c-phone" type="tel" dir="ltr" value={f.phone} onChange={set('phone')} />
      </FormField>
      <FormField id="c-subject" label={t('subject')} error={errors.subject} required>
        <Input id="c-subject" value={f.subject} onChange={set('subject')} />
      </FormField>
      <FormField id="c-message" label={t('message')} error={errors.message} className="sm:col-span-2" required>
        <Textarea id="c-message" rows={6} value={f.message} onChange={set('message')} maxLength={5000} />
      </FormField>
      <input type="text" name="website" value={f.website} onChange={set('website')} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={pending}>
          {t('send')}
        </Button>
      </div>
    </form>
  )
}
