'use client'
import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@/i18n/navigation'
import { emailSchema, passwordSchema } from '@/lib/validation'
import { requestPasswordReset, updatePassword } from '../actions'

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot')
  const tl = useTranslations('auth.login')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()
  if (sent) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <p className="mt-3 text-sm">{t('sent')}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/login">{t('back')}</Link>
        </Button>
      </div>
    )
  }
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = emailSchema.safeParse(email)
        if (!parsed.success) return setError(parsed.error.issues[0]?.message)
        setError(undefined)
        start(async () => {
          await requestPasswordReset(parsed.data)
          setSent(true)
        })
      }}
    >
      <FormField id="email" label={tl('email')} error={error}>
        <Input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t('submit')}
      </Button>
      <Link href="/login" className="block text-center text-sm font-semibold text-gold hover:underline">
        {t('back')}
      </Link>
    </form>
  )
}

export function ResetPasswordForm() {
  const t = useTranslations('auth.reset')
  const tr = useTranslations('auth.register')
  const te = useTranslations('errors')
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = passwordSchema.safeParse(password)
        if (!parsed.success) return setErrors({ password: parsed.error.issues[0]?.message })
        if (password !== confirm) return setErrors({ confirm: 'passwordsDontMatch' })
        setErrors({})
        start(async () => {
          const res = await updatePassword(password)
          if (!res.ok) {
            toast.error(res.error === 'unauthenticated' ? t('invalidLink') : te(res.error))
            return
          }
          toast.success(t('done'))
          router.replace('/dashboard')
        })
      }}
    >
      <FormField id="password" label={tr('password')} error={errors.password} hint={tr('passwordHint')}>
        <Input id="password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      <FormField id="confirm" label={tr('confirmPassword')} error={errors.confirm}>
        <Input id="confirm" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t('submit')}
      </Button>
    </form>
  )
}
