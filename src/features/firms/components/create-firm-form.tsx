'use client'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { useRouter } from '@/i18n/navigation'
import { createFirm } from '../actions'

export function CreateFirmForm({ governorates }: { governorates: { id: number; name: string }[] }) {
  const t = useTranslations('firm.create')
  const te = useTranslations('errors')
  const router = useRouter()
  const [f, setF] = useState({ nameAr: '', nameEn: '', slug: '', governorateId: null as number | null })
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="cf-ar" label={t('nameAr')} required>
        <Input id="cf-ar" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} />
      </FormField>
      <FormField id="cf-en" label={t('nameEn')}>
        <Input id="cf-en" dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value, slug: f.slug || '' })} />
      </FormField>
      <FormField id="cf-slug" label={t('slug')}>
        <Input id="cf-slug" dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="my-law-firm" />
      </FormField>
      <FormField id="cf-gov" label={t('governorate')}>
        <NativeSelect id="cf-gov" value={f.governorateId ?? ''} onChange={(e) => setF({ ...f, governorateId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="sm:col-span-2">
        <Button
          variant="gold"
          loading={pending}
          disabled={f.nameAr.trim().length < 3}
          onClick={() =>
            start(async () => {
              const res = await createFirm(f)
              if (!res.ok) return void toast.error(res.detail ?? te(res.fieldErrors ? (Object.values(res.fieldErrors)[0] as 'required') : res.error))
              toast.success(t('created'))
              document.cookie = `qanony_firm=${res.data.id}; path=/; max-age=31536000; samesite=lax`
              router.push('/firm')
              router.refresh()
            })
          }
        >
          {t('submit')}
        </Button>
      </div>
    </div>
  )
}
