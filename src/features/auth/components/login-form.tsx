'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { FormField } from '@/components/shared/form'
import { Notice } from '@/components/shared/notices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link, useRouter } from '@/i18n/navigation'
import { mapDbError } from '@/lib/errors'
import { getBrowserClient } from '@/lib/supabase/client'
import { loginSchema, safeNextPath } from '@/lib/validation'
import { sendMagicLink } from '../actions'

export function LoginForm({ next, inactive }: { next?: string; inactive?: boolean }) {
  const t = useTranslations('auth.login')
  const te = useTranslations('errors')
  const router = useRouter()
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const finish = () => {
    router.replace(safeNextPath(next))
    router.refresh()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setBusy(true)
    const supabase = getBrowserClient()
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setBusy(false)
      toast.error(te(mapDbError({ message: error.message, status: error.status })))
      return
    }
    // Optional MFA: if the user enrolled a TOTP factor, require AAL2.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp.find((f) => f.status === 'verified')
      if (totp) {
        setMfa({ factorId: totp.id })
        setBusy(false)
        return
      }
    }
    finish()
  })

  async function verifyMfa() {
    if (!mfa) return
    setBusy(true)
    const supabase = getBrowserClient()
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: mfa.factorId })
    if (cErr || !challenge) {
      setBusy(false)
      toast.error(te('unknown'))
      return
    }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfa.factorId, challengeId: challenge.id, code })
    setBusy(false)
    if (error) toast.error(te('invalidCredentials'))
    else finish()
  }

  if (mfa) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5 text-gold" aria-hidden /> {t('mfaTitle')}
        </div>
        <FormField id="mfa" label={t('mfaCode')}>
          <Input id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="ltr-nums text-center text-lg tracking-[0.5em]" />
        </FormField>
        <Button className="w-full" size="lg" loading={busy} disabled={code.length !== 6} onClick={verifyMfa}>
          {t('mfaSubmit')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {inactive ? <Notice tone="danger" title={t('inactive')} /> : null}
      <FormField id="email" label={t('email')} error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" dir="ltr" {...form.register('email')} aria-invalid={!!form.formState.errors.email} />
      </FormField>
      <FormField id="password" label={t('password')} error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" dir="ltr" {...form.register('password')} aria-invalid={!!form.formState.errors.password} />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-gold hover:underline">
          {t('forgot')}
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        {t('submit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={async () => {
          const email = form.getValues('email')
          if (!email) {
            await form.trigger('email')
            return
          }
          await sendMagicLink(email, next)
          toast.success(t('magicSent'))
        }}
      >
        {t('magicLink')}
      </Button>
    </form>
  )
}
