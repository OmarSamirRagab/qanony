'use client'
import { Camera, Plus, Star, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Checkbox, Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Enums } from '@/types/database'
import { setPrimaryFirm } from '@/features/firms/actions'
import { deleteOffice, saveLawyerProfile, saveOffering, saveOffice, saveSpecializations } from './profile-actions-proxy'

type Kind = Enums<'consultation_kind'>
const KINDS: Kind[] = ['video', 'voice', 'text', 'in_person', 'written_opinion']

function useSave() {
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const save = (fn: () => Promise<ActionResult>, success: string) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) {
        const field = res.fieldErrors ? Object.values(res.fieldErrors)[0] : undefined
        toast.error(res.detail ?? (field ? te(field as 'required') : te(res.error)))
        return
      }
      toast.success(success)
      router.refresh()
    })
  return { pending, save }
}

export interface ProfileEditorProps {
  userId: string
  profile: {
    display_name_ar: string
    display_name_en: string | null
    title_ar: string | null
    title_en: string | null
    bio_ar: string | null
    bio_en: string | null
    photo_url: string | null
    gender: string | null
    years_experience: number
    bar_admission_level: string | null
    show_bar_number: boolean
    languages: string[]
    governorate_id: number | null
    city_id: number | null
    education: { degree: string; institution: string; year: number | null }[]
    slug: string
    ai_enabled: boolean
    primary_firm_id: string | null
  }
  governorates: { id: number; name: string }[]
  cities: { id: number; governorateId: number; name: string }[]
  categories: { id: string; name: string }[]
  specializations: { categoryId: string; primary: boolean }[]
  offerings: { type: Kind; enabled: boolean; price: number; duration: number }[]
  offices: { id: string; label: string; address_ar: string; address_en: string | null; map_url: string | null }[]
  firms: { id: string; name: string }[]
}

export function ProfileEditor(props: ProfileEditorProps) {
  const t = useTranslations('dashboard.profile')
  const te = useTranslations('enums')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const locale = useLocale()
  const { pending, save } = useSave()
  const p = props.profile
  const [f, setF] = useState({
    displayNameAr: p.display_name_ar,
    displayNameEn: p.display_name_en ?? '',
    titleAr: p.title_ar ?? '',
    titleEn: p.title_en ?? '',
    bioAr: p.bio_ar ?? '',
    bioEn: p.bio_en ?? '',
    photoUrl: p.photo_url ?? '',
    gender: (p.gender as 'male' | 'female' | null) ?? null,
    yearsExperience: p.years_experience,
    barLevel: (p.bar_admission_level as 'general' | null) ?? null,
    showBarNumber: p.show_bar_number,
    languages: p.languages,
    governorateId: p.governorate_id,
    cityId: p.city_id,
    education: p.education,
    slug: p.slug,
    aiEnabled: p.ai_enabled,
  })
  const [specs, setSpecs] = useState(props.specializations)
  const [offers, setOffers] = useState(() => KINDS.map((k) => props.offerings.find((o) => o.type === k) ?? { type: k, enabled: false, price: 300, duration: k === 'in_person' ? 60 : 30 }))
  const [office, setOffice] = useState({ label: '', addressAr: '', addressEn: '', mapUrl: '' })
  const [uploading, setUploading] = useState(false)

  async function uploadPhoto(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return void toast.error(terr('invalidFile'))
    setUploading(true)
    const path = `${props.userId}/photo-${Date.now()}.${file.type.split('/')[1]}`
    const supabase = getBrowserClient()
    const { error } = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type, upsert: false })
    setUploading(false)
    if (error) return void toast.error(terr('network'))
    const { data } = supabase.storage.from('public-media').getPublicUrl(path)
    setF((s) => ({ ...s, photoUrl: data.publicUrl }))
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  const card = 'rounded-xl border bg-card p-5 shadow-soft'

  return (
    <div className="space-y-6">
      {/* Basic */}
      <section className={card}>
        <div className="mb-5 flex items-center gap-4">
          <Avatar src={f.photoUrl} name={f.displayNameAr} className="size-20 rounded-2xl" />
          <div>
            <div className="font-semibold">{t('photo')}</div>
            <p className="text-xs text-muted-foreground">{t('photoHint')}</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <Camera className="size-3.5" aria-hidden /> {uploading ? tc('loading') : t('uploadPhoto')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="p-dar" label={t('displayNameAr')} required>
            <Input id="p-dar" value={f.displayNameAr} onChange={set('displayNameAr')} />
          </FormField>
          <FormField id="p-den" label={t('displayNameEn')}>
            <Input id="p-den" dir="ltr" value={f.displayNameEn} onChange={set('displayNameEn')} />
          </FormField>
          <FormField id="p-tar" label={t('titleAr')}>
            <Input id="p-tar" value={f.titleAr} onChange={set('titleAr')} placeholder={t('titlePlaceholder')} />
          </FormField>
          <FormField id="p-ten" label={t('titleEn')}>
            <Input id="p-ten" dir="ltr" value={f.titleEn} onChange={set('titleEn')} />
          </FormField>
          <FormField id="p-bar" label={t('bioAr')} hint={t('bioHint')} className="sm:col-span-2">
            <Textarea id="p-bar" rows={5} value={f.bioAr} onChange={set('bioAr')} maxLength={5000} />
          </FormField>
          <FormField id="p-ben" label={t('bioEn')} className="sm:col-span-2">
            <Textarea id="p-ben" dir="ltr" rows={4} value={f.bioEn} onChange={set('bioEn')} maxLength={5000} />
          </FormField>
          <FormField id="p-exp" label={t('experience')}>
            <Input id="p-exp" type="number" min={0} max={70} value={f.yearsExperience} onChange={(e) => setF({ ...f, yearsExperience: Number(e.target.value) })} />
          </FormField>
          <FormField id="p-gender" label={t('gender')}>
            <NativeSelect id="p-gender" value={f.gender ?? ''} onChange={(e) => setF({ ...f, gender: (e.target.value || null) as 'male' | null })}>
              <option value="">—</option>
              <option value="male">{te('gender.male')}</option>
              <option value="female">{te('gender.female')}</option>
            </NativeSelect>
          </FormField>
          <FormField id="p-level" label={t('barLevel')}>
            <NativeSelect id="p-level" value={f.barLevel ?? ''} onChange={(e) => setF({ ...f, barLevel: (e.target.value || null) as 'general' | null })}>
              <option value="">—</option>
              {(['general', 'primary', 'appeal', 'cassation'] as const).map((l) => (
                <option key={l} value={l}>
                  {te(`barLevel.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="p-slug" label={t('slug')} hint={t('slugHint', { slug: f.slug })}>
            <Input id="p-slug" dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </FormField>
          <FormField id="p-gov" label={t('governorate')}>
            <NativeSelect id="p-gov" value={f.governorateId ?? ''} onChange={(e) => setF({ ...f, governorateId: e.target.value ? Number(e.target.value) : null, cityId: null })}>
              <option value="">—</option>
              {props.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="p-city" label={t('city')}>
            <NativeSelect id="p-city" value={f.cityId ?? ''} onChange={(e) => setF({ ...f, cityId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {props.cities
                .filter((c) => c.governorateId === f.governorateId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </FormField>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t('languages')}</legend>
            <div className="flex flex-wrap gap-4">
              {[
                ['ar', tc('arabic')],
                ['en', tc('english')],
                ['fr', 'Français'],
                ['de', 'Deutsch'],
              ].map(([code, label]) => (
                <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={f.languages.includes(code!)}
                    onCheckedChange={(v) => setF({ ...f, languages: v ? [...f.languages, code!] : f.languages.filter((l) => l !== code) })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={f.showBarNumber} onCheckedChange={(v) => setF({ ...f, showBarNumber: v === true })} /> {t('showBarNumber')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={f.aiEnabled} onCheckedChange={(v) => setF({ ...f, aiEnabled: v === true })} /> {t('aiEnabled')}
          </label>
        </div>
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('education')}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, education: [...f.education, { degree: '', institution: '', year: null }] })}>
              <Plus aria-hidden /> {t('addEducation')}
            </Button>
          </div>
          <div className="space-y-2">
            {f.education.map((ed, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
                <Input aria-label={t('degree')} placeholder={t('degree')} value={ed.degree} onChange={(e) => setF({ ...f, education: f.education.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)) })} />
                <Input aria-label={t('institution')} placeholder={t('institution')} value={ed.institution} onChange={(e) => setF({ ...f, education: f.education.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)) })} />
                <Input aria-label={t('year')} placeholder={t('year')} type="number" value={ed.year ?? ''} onChange={(e) => setF({ ...f, education: f.education.map((x, j) => (j === i ? { ...x, year: e.target.value ? Number(e.target.value) : null } : x)) })} />
                <Button type="button" variant="ghost" size="icon" aria-label={tc('remove')} onClick={() => setF({ ...f, education: f.education.filter((_, j) => j !== i) })}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <Button className="mt-6" loading={pending} onClick={() => save(() => saveLawyerProfile({ ...f, education: f.education.filter((e) => e.degree.trim()) }), t('saved'))}>
          {tc('save')}
        </Button>
      </section>

      {/* Specializations */}
      <section id="specializations" className={card}>
        <h2 className="font-bold">{t('specializations')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('specializationsHint')}</p>
        <div className="flex flex-wrap gap-2">
          {props.categories.map((c) => {
            const sel = specs.find((s) => s.categoryId === c.id)
            return (
              <span key={c.id} className="inline-flex items-center">
                <button
                  type="button"
                  aria-pressed={Boolean(sel)}
                  disabled={!sel && specs.length >= 6}
                  onClick={() => setSpecs(sel ? specs.filter((s) => s.categoryId !== c.id) : [...specs, { categoryId: c.id, primary: specs.length === 0 }])}
                  className={cn('cursor-pointer rounded-full border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40', sel && 'border-gold bg-gold-soft font-semibold')}
                >
                  {c.name}
                </button>
                {sel ? (
                  <button
                    type="button"
                    title={t('primary')}
                    aria-label={t('primary')}
                    onClick={() => setSpecs(specs.map((s) => ({ ...s, primary: s.categoryId === c.id })))}
                    className="ms-1 cursor-pointer"
                  >
                    <Star className={cn('size-4', sel.primary ? 'fill-gold text-gold' : 'text-muted-foreground')} />
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(() => saveSpecializations(specs), t('saved'))}>
          {tc('save')}
        </Button>
      </section>

      {/* Offerings */}
      <section id="offerings" className={card}>
        <h2 className="font-bold">{t('offerings')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('offeringsHint')}</p>
        <div className="space-y-2">
          {offers.map((o, i) => (
            <div key={o.type} className={cn('grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_140px_140px_auto]', !o.enabled && 'opacity-70')}>
              <span className="font-semibold">{te(`consultation.${o.type}`)}</span>
              <Input aria-label={t('price')} type="number" min={0} value={o.price} onChange={(e) => setOffers(offers.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
              <Input aria-label={t('duration')} type="number" min={10} max={240} step={5} value={o.duration} onChange={(e) => setOffers(offers.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) } : x)))} />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={o.enabled} onCheckedChange={(v) => setOffers(offers.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} /> {t('enabled')}
              </label>
            </div>
          ))}
          <div className="hidden px-3 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_140px_140px_auto] sm:gap-3">
            <span />
            <span>{t('price')}</span>
            <span>{t('duration')}</span>
          </div>
        </div>
        <Button className="mt-4" loading={pending} onClick={() => save(() => saveOffering(offers), t('saved'))}>
          {tc('save')}
        </Button>
      </section>

      {/* Offices */}
      <section className={card}>
        <h2 className="mb-4 font-bold">{t('offices')}</h2>
        <ul className="mb-4 space-y-2">
          {props.offices.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <div className="font-semibold">{o.label}</div>
                <div className="text-muted-foreground">{locale === 'en' && o.address_en ? o.address_en : o.address_ar}</div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={tc('remove')} onClick={() => save(() => deleteOffice(o.id), t('saved'))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={t('officeLabel')} aria-label={t('officeLabel')} value={office.label} onChange={(e) => setOffice({ ...office, label: e.target.value })} />
          <Input placeholder={t('mapUrl')} aria-label={t('mapUrl')} dir="ltr" value={office.mapUrl} onChange={(e) => setOffice({ ...office, mapUrl: e.target.value })} />
          <Input placeholder={t('address')} aria-label={t('address')} className="sm:col-span-2" value={office.addressAr} onChange={(e) => setOffice({ ...office, addressAr: e.target.value })} />
        </div>
        <Button
          variant="outline"
          className="mt-3"
          disabled={office.label.trim().length < 2 || office.addressAr.trim().length < 5}
          loading={pending}
          onClick={() => {
            save(() => saveOffice(office), t('saved'))
            setOffice({ label: '', addressAr: '', addressEn: '', mapUrl: '' })
          }}
        >
          <Plus aria-hidden /> {t('addOffice')}
        </Button>
      </section>

      {props.firms.length ? (
        <section className={card}>
          <h2 className="mb-3 font-bold">{t('primaryFirm')}</h2>
          <NativeSelect defaultValue={p.primary_firm_id ?? ''} aria-label={t('primaryFirm')} onChange={(e) => save(() => setPrimaryFirm(e.target.value || null), t('saved'))}>
            <option value="">{t('noFirm')}</option>
            {props.firms.map((fm) => (
              <option key={fm.id} value={fm.id}>
                {fm.name}
              </option>
            ))}
          </NativeSelect>
        </section>
      ) : null}
    </div>
  )
}
