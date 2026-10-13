'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { Link } from '@/i18n/navigation'
import { registerSchema } from '@/lib/validation'
import { register as registerAction } from '../actions'

type Values = z.input<typeof registerSchema>

export function RegisterForm({ accountType }: { accountType: 'client' | 'lawyer' }) {
  const t = useTranslations('auth.register')
  const te = useTranslations('errors')
  const [pending, start] = useTransition()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { accountType, fullName: '', nameEn: '', phone: '', email: '', password: '', confirmPassword: '', terms: false as unknown as true, marketing: false },
  })
  const err = form.formState.errors

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await registerAction(values)
      if (!res.ok) {
        if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof Values, { message: v })
        else toast.error(res.detail ?? te(res.error))
        return
      }
      setSentTo(res.data.email)
    }),
  )

  if (sentTo) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-soft" role="status">
        <MailCheck className="mx-auto size-12 text-gold" aria-hidden />
        <h2 className="mt-4 text-xl font-bold">{t('checkEmailTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('checkEmailBody', { email: sentTo })}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/login">{t('login')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="fullName" label={t('fullName')} error={err.fullName?.message} required>
        <Input id="fullName" autoComplete="name" {...form.register('fullName')} aria-invalid={!!err.fullName} />
      </FormField>
      {accountType === 'lawyer' ? (
        <FormField id="nameEn" label={t('fullNameEn')} error={err.nameEn?.message}>
          <Input id="nameEn" dir="ltr" {...form.register('nameEn')} />
        </FormField>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="phone" label={t('phone')} error={err.phone?.message} required>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01012345678" {...form.register('phone')} aria-invalid={!!err.phone} />
        </FormField>
        <FormField id="email" label={t('email')} error={err.email?.message} required>
          <Input id="email" type="email" autoComplete="email" dir="ltr" {...form.register('email')} aria-invalid={!!err.email} />
        </FormField>
      </div>
      <FormField id="password" label={t('password')} error={err.password?.message} hint={t('passwordHint')} required>
        <Input id="password" type="password" autoComplete="new-password" dir="ltr" {...form.register('password')} aria-invalid={!!err.password} />
      </FormField>
      <FormField id="confirmPassword" label={t('confirmPassword')} error={err.confirmPassword?.message} required>
        <Input id="confirmPassword" type="password" autoComplete="new-password" dir="ltr" {...form.register('confirmPassword')} aria-invalid={!!err.confirmPassword} />
      </FormField>
      <div className="space-y-3 pt-1">
        <Controller
          control={form.control}
          name="terms"
          render={({ field }) => (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={!!err.terms} className="mt-0.5" />
              <span>
                {t.rich('terms', {
                  terms: (chunks) => <Link href="/terms" className="font-semibold text-gold hover:underline" target="_blank">{chunks}</Link>,
                  privacy: (chunks) => <Link href="/privacy" className="font-semibold text-gold hover:underline" target="_blank">{chunks}</Link>,
                })}
              </span>
            </label>
          )}
        />
        {err.terms ? <p className="text-xs font-medium text-destructive">{te('mustAcceptTerms')}</p> : null}
        <Controller
          control={form.control}
          name="marketing"
          render={({ field }) => (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
              {t('marketing')}
            </label>
          )}
        />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t('submit')}
      </Button>
    </form>
  )
}
