'use client'
import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { usePathname, useRouter } from '@/i18n/navigation'
import { getBrowserClient } from '@/lib/supabase/client'
import { passwordSchema } from '@/lib/validation'
import { updatePassword } from '@/features/auth/actions'
import { cancelDeletion, requestDeletion, saveNotificationPreferences, savePrivacy, updateProfile } from '../actions'

export function ProfileForm({ initial, governorates }: { initial: { fullName: string; phone: string; locale: 'ar' | 'en'; governorateId: number | null }; governorates: { id: number; name: string }[] }) {
  const t = useTranslations('dashboard.settings')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const router = useRouter()
  const pathname = usePathname()
  const [f, setF] = useState({ ...initial, phone: initial.phone.replace(/^\+20/, '0') })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await updateProfile(f)
          if (!res.ok) {
            if (res.fieldErrors) setErrors(res.fieldErrors)
            else toast.error(te(res.error))
            return
          }
          setErrors({})
          toast.success(t('saved'))
          if (f.locale !== initial.locale) router.replace(pathname, { locale: f.locale })
          else router.refresh()
        })
      }}
    >
      <FormField id="s-name" label={t('fullName')} error={errors.fullName}>
        <Input id="s-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      </FormField>
      <FormField id="s-phone" label={t('phone')} error={errors.phone}>
        <Input id="s-phone" dir="ltr" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </FormField>
      <FormField id="s-locale" label={t('language')}>
        <NativeSelect id="s-locale" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as 'ar' })}>
          <option value="ar">{tc('arabic')}</option>
          <option value="en">{tc('english')}</option>
        </NativeSelect>
      </FormField>
      <FormField id="s-gov" label={t('governorate')}>
        <NativeSelect id="s-gov" value={f.governorateId ?? ''} onChange={(e) => setF({ ...f, governorateId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {tc('save')}
        </Button>
      </div>
    </form>
  )
}

const EVENTS = ['*', 'appointment.reminder', 'appointment.confirmed', 'appointment.cancelled', 'message.new', 'payment.succeeded', 'hearing.reminder', 'matter.status_changed'] as const
const CHANNELS = ['email', 'sms', 'whatsapp'] as const

export function NotificationPrefsForm({ initial, eventLabels }: { initial: { event_type: string; channel: string; enabled: boolean }[]; eventLabels: Record<string, string> }) {
  const t = useTranslations('dashboard.settings')
  const tc = useTranslations('common')
  const tch = useTranslations('enums.channel')
  const te = useTranslations('errors')
  const defaults = (ev: string, ch: string) => (ch === 'email' ? true : ch === 'sms' ? ['appointment.reminder', 'appointment.cancelled', 'hearing.reminder', 'payment.succeeded'].includes(ev) : false)
  const [state, setState] = useState(() => {
    const m: Record<string, boolean> = {}
    for (const ev of EVENTS) for (const ch of CHANNELS) m[`${ev}|${ch}`] = initial.find((p) => p.event_type === ev && p.channel === ch)?.enabled ?? (ev === '*' ? true : defaults(ev, ch))
    return m
  })
  const [pending, start] = useTransition()
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{t('notificationsHint')}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-start font-semibold" />
              {CHANNELS.map((c) => (
                <th key={c} className="py-2 text-center font-semibold">
                  {tch(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((ev) => (
              <tr key={ev} className="border-b last:border-0">
                <td className="py-2.5 font-medium">{ev === '*' ? t('allEvents') : (eventLabels[ev] ?? ev)}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch} className="py-2.5 text-center">
                    <Switch checked={state[`${ev}|${ch}`]} onCheckedChange={(v) => setState((s) => ({ ...s, [`${ev}|${ch}`]: v }))} aria-label={`${ev} ${ch}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        className="mt-4"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await saveNotificationPreferences(Object.entries(state).map(([k, enabled]) => ({ event: k.split('|')[0]!, channel: k.split('|')[1] as 'email', enabled })))
            if (!res.ok) return void toast.error(te(res.error))
            toast.success(t('saved'))
          })
        }
      >
        {tc('save')}
      </Button>
    </div>
  )
}

export function PrivacyForm({ initial }: { initial: { showName: boolean; aiEnabled: boolean; aiConsent: boolean; marketing: boolean } }) {
  const t = useTranslations('dashboard.settings')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const [f, setF] = useState(initial)
  const [pending, start] = useTransition()
  const row = (key: keyof typeof f, label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={f[key]} onCheckedChange={(v) => setF({ ...f, [key]: v })} />
    </label>
  )
  return (
    <div className="divide-y">
      {row('showName', t('showNameInReviews'))}
      {row('aiEnabled', t('aiEnabled'))}
      {row('aiConsent', t('aiConsent'), t('aiConsentHint'))}
      {row('marketing', t('marketing'))}
      <div className="pt-4">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await savePrivacy(f)
              if (!res.ok) return void toast.error(te(res.error))
              toast.success(t('saved'))
            })
          }
        >
          {tc('save')}
        </Button>
      </div>
    </div>
  )
}

export function SecurityForm() {
  const t = useTranslations('dashboard.settings')
  const te = useTranslations('errors')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string>()
  const [pending, start] = useTransition()
  const [mfa, setMfa] = useState<{ status: 'loading' | 'off' | 'enrolling' | 'on'; factorId?: string; qr?: string; secret?: string }>({ status: 'loading' })
  const [code, setCode] = useState('')

  useEffect(() => {
    void getBrowserClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        const f = data?.totp.find((x) => x.status === 'verified')
        setMfa(f ? { status: 'on', factorId: f.id } : { status: 'off' })
      })
  }, [])

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          const p = passwordSchema.safeParse(password)
          if (!p.success) return setErr(p.error.issues[0]?.message)
          setErr(undefined)
          start(async () => {
            const res = await updatePassword(password)
            if (!res.ok) return void toast.error(te(res.error))
            setPassword('')
            toast.success(t('passwordChanged'))
          })
        }}
      >
        <FormField id="new-pass" label={t('newPassword')} error={err} className="flex-1">
          <Input id="new-pass" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" loading={pending}>
          {t('changePassword')}
        </Button>
      </form>
      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-4 text-gold" aria-hidden /> {t('mfa')}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('mfaHint')}</p>
        {mfa.status === 'off' ? (
          <Button
            variant="outline"
            className="mt-3"
            onClick={async () => {
              const { data, error } = await getBrowserClient().auth.mfa.enroll({ factorType: 'totp' })
              if (error || !data) return void toast.error(te('unknown'))
              setMfa({ status: 'enrolling', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
            }}
          >
            {t('mfaEnable')}
          </Button>
        ) : null}
        {mfa.status === 'enrolling' ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">{t('mfaScan')}</p>
            {mfa.qr ? <img src={mfa.qr} alt="QR" className="size-40 rounded-lg bg-white p-2" /> : null}
            <p className="text-xs text-muted-foreground">
              {t('mfaSecret')} <code className="ltr-nums select-all">{mfa.secret}</code>
            </p>
            <div className="flex gap-2">
              <Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-40 text-center tracking-widest" aria-label="code" />
              <Button
                disabled={code.length !== 6}
                onClick={async () => {
                  const supabase = getBrowserClient()
                  const { data: ch } = await supabase.auth.mfa.challenge({ factorId: mfa.factorId! })
                  if (!ch) return void toast.error(te('unknown'))
                  const { error } = await supabase.auth.mfa.verify({ factorId: mfa.factorId!, challengeId: ch.id, code })
                  if (error) return void toast.error(te('invalidCredentials'))
                  setMfa({ status: 'on', factorId: mfa.factorId })
                  toast.success(t('mfaEnabled'))
                }}
              >
                {t('mfaVerify')}
              </Button>
            </div>
          </div>
        ) : null}
        {mfa.status === 'on' ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-semibold text-success">{t('mfaEnabled')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const { error } = await getBrowserClient().auth.mfa.unenroll({ factorId: mfa.factorId! })
                if (error) return void toast.error(te('unknown'))
                setMfa({ status: 'off' })
              }}
            >
              {t('mfaDisable')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function DeletionForm({ pending: pendingDeletion }: { pending: boolean }) {
  const t = useTranslations('dashboard.settings')
  const te = useTranslations('errors')
  const router = useRouter()
  const [word, setWord] = useState('')
  const [busy, start] = useTransition()
  if (pendingDeletion) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-destructive">{t('pendingDeletion')}</span>
        <Button variant="outline" loading={busy} onClick={() => start(async () => { const r = await cancelDeletion(); if (!r.ok) toast.error(te(r.error)); router.refresh() })}>
          {t('cancelDeletion')}
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('deleteHint')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder={t('deleteConfirm')} aria-label={t('deleteConfirm')} className="sm:w-64" />
        <Button
          variant="destructive"
          disabled={word.trim() !== t('deleteWord')}
          loading={busy}
          onClick={() =>
            start(async () => {
              const res = await requestDeletion()
              if (!res.ok) return void toast.error(te(res.error))
              toast.success(t('deletionRequested'))
              await getBrowserClient().auth.signOut()
              router.replace('/')
            })
          }
        >
          {t('deleteAccount')}
        </Button>
      </div>
    </div>
  )
}
