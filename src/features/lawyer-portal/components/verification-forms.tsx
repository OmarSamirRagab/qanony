'use client'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { ACCEPT_ATTR, isAllowedFile } from '@/lib/files'
import { uploadDocument } from '@/features/documents/upload-client'
import { addCredential, submitVerification } from '../actions'

const KINDS = ['bar_card', 'degree', 'certification', 'license', 'other'] as const

export function AddCredentialForm() {
  const t = useTranslations('dashboard.verification')
  const te = useTranslations('enums.credentialKind')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({ kind: 'bar_card' as (typeof KINDS)[number], title: '', issuer: '', issuedOn: '', isPublic: false })
  const [file, setFile] = useState<File | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField id="c-kind" label={t('credentialKind')}>
        <NativeSelect id="c-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'other' })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {te(k)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="c-title" label={t('credentialTitle')}>
        <Input id="c-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </FormField>
      <FormField id="c-issuer" label={t('issuer')}>
        <Input id="c-issuer" value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} />
      </FormField>
      <FormField id="c-date" label={t('issuedOn')}>
        <Input id="c-date" type="date" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} />
      </FormField>
      <FormField id="c-file" label={t('file')} className="sm:col-span-2">
        <Input id="c-file" type="file" accept={ACCEPT_ATTR} className="h-auto py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </FormField>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={f.isPublic} onCheckedChange={(v) => setF({ ...f, isPublic: v === true })} /> {t('public')}
      </label>
      <div className="sm:col-span-2">
        <Button
          variant="outline"
          disabled={!file || f.title.trim().length < 2}
          loading={pending}
          onClick={() =>
            file &&
            start(async () => {
              if (!isAllowedFile(file)) return void toast.error(terr('invalidFile'))
              const up = await uploadDocument(file, { category: 'credential', title: f.title })
              if (!up.ok) return void toast.error(terr(up.error))
              const res = await addCredential({ ...f, documentId: up.documentId })
              if (!res.ok) return void toast.error(terr(res.error))
              setF({ kind: 'bar_card', title: '', issuer: '', issuedOn: '', isPublic: false })
              setFile(null)
              router.refresh()
            })
          }
        >
          <Plus aria-hidden /> {t('addCredential')}
        </Button>
      </div>
    </div>
  )
}

export function SubmitVerificationForm({ credentials, defaultBar }: { credentials: { id: string; title: string }[]; defaultBar: string }) {
  const t = useTranslations('dashboard.verification')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [bar, setBar] = useState(defaultBar)
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[]>(credentials.map((c) => c.id))
  const [pending, start] = useTransition()
  return (
    <div className="space-y-4">
      <FormField id="v-bar" label={t('barNumber')} required>
        <Input id="v-bar" dir="ltr" value={bar} onChange={(e) => setBar(e.target.value)} className="max-w-xs" />
      </FormField>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t('credentials')}</legend>
        {credentials.length ? (
          <div className="space-y-1.5">
            {credentials.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(c.id)} onCheckedChange={(v) => setSelected(v ? [...selected, c.id] : selected.filter((x) => x !== c.id))} /> {c.title}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('needCredential')}</p>
        )}
      </fieldset>
      <FormField id="v-note" label={t('note')}>
        <Textarea id="v-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <Button
        variant="gold"
        disabled={!bar.trim() || selected.length === 0}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await submitVerification(bar, note, selected)
            if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
            toast.success(t('submitted'))
            router.refresh()
          })
        }
      >
        {t('submit')}
      </Button>
    </div>
  )
}
