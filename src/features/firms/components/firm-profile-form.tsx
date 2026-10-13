'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import { updateFirmProfile } from '../actions'

export interface FirmProfileInitial {
  name_ar: string
  name_en: string | null
  description_ar: string | null
  description_en: string | null
  website: string | null
  email: string | null
  phone: string | null
  commercial_registration: string | null
  founded_year: number | null
  governorate_id: number | null
  ai_enabled: boolean
  is_published: boolean
}

export function FirmProfileForm({ firmId, initial, verified, governorates }: { firmId: string; initial: FirmProfileInitial; verified: boolean; governorates: { id: number; name: string }[] }) {
  const t = useTranslations('firm.profile')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [f, setF] = useState({
    nameAr: initial.name_ar,
    nameEn: initial.name_en ?? '',
    descriptionAr: initial.description_ar ?? '',
    descriptionEn: initial.description_en ?? '',
    website: initial.website ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    commercialRegistration: initial.commercial_registration ?? '',
    foundedYear: initial.founded_year,
    governorateId: initial.governorate_id,
    aiEnabled: initial.ai_enabled,
    isPublished: initial.is_published,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="fp-nar" label={t('nameAr')}>
        <Input id="fp-nar" value={f.nameAr} onChange={set('nameAr')} />
      </FormField>
      <FormField id="fp-nen" label={t('nameEn')}>
        <Input id="fp-nen" dir="ltr" value={f.nameEn} onChange={set('nameEn')} />
      </FormField>
      <FormField id="fp-dar" label={t('descriptionAr')} className="sm:col-span-2">
        <Textarea id="fp-dar" rows={4} value={f.descriptionAr} onChange={set('descriptionAr')} />
      </FormField>
      <FormField id="fp-den" label={t('descriptionEn')} className="sm:col-span-2">
        <Textarea id="fp-den" dir="ltr" rows={3} value={f.descriptionEn} onChange={set('descriptionEn')} />
      </FormField>
      <FormField id="fp-web" label={t('website')}>
        <Input id="fp-web" dir="ltr" type="url" value={f.website} onChange={set('website')} />
      </FormField>
      <FormField id="fp-email" label={t('email')}>
        <Input id="fp-email" dir="ltr" type="email" value={f.email} onChange={set('email')} />
      </FormField>
      <FormField id="fp-phone" label={t('phone')}>
        <Input id="fp-phone" dir="ltr" value={f.phone} onChange={set('phone')} />
      </FormField>
      <FormField id="fp-cr" label={t('commercialRegistration')}>
        <Input id="fp-cr" dir="ltr" value={f.commercialRegistration} onChange={set('commercialRegistration')} />
      </FormField>
      <FormField id="fp-year" label={t('foundedYear')}>
        <Input id="fp-year" type="number" value={f.foundedYear ?? ''} onChange={(e) => setF({ ...f, foundedYear: e.target.value ? Number(e.target.value) : null })} />
      </FormField>
      <FormField id="fp-gov" label={t('governorate')}>
        <NativeSelect id="fp-gov" value={f.governorateId ?? ''} onChange={(e) => setF({ ...f, governorateId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={f.aiEnabled} onCheckedChange={(v) => setF({ ...f, aiEnabled: v })} /> {t('aiEnabled')}
      </label>
      <label className="flex items-center gap-2 text-sm" title={!verified ? t('publishRequiresVerification') : undefined}>
        <Switch disabled={!verified && !f.isPublished} checked={f.isPublished} onCheckedChange={(v) => setF({ ...f, isPublished: v })} /> {t('publish')}
      </label>
      {!verified ? <p className="text-xs text-muted-foreground sm:col-span-2">{t('publishRequiresVerification')}</p> : null}
      <div className="sm:col-span-2">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await updateFirmProfile(firmId, f)
              if (!res.ok) return void toast.error(res.detail ?? te(res.fieldErrors ? 'required' : res.error))
              toast.success(t('saved'))
              router.refresh()
            })
          }
        >
          {tc('save')}
        </Button>
      </div>
    </div>
  )
}
