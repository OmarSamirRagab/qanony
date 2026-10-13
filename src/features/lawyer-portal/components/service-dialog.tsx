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
import { saveService } from '../actions'

export interface ServiceInitial {
  id: string
  slug: string
  title_ar: string
  title_en: string | null
  description_ar: string
  description_en: string | null
  category_id: string | null
  price_minor: number
  estimated_days: number
  revisions_included: number
  deliverables: string[]
  required_documents: string[]
  revision_policy: string | null
  refund_terms: string | null
}

export function ServiceDialog({ initial, categories }: { initial?: ServiceInitial; categories: { id: string; name: string }[] }) {
  const t = useTranslations('dashboard.services')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [f, setF] = useState({
    slug: initial?.slug ?? '',
    titleAr: initial?.title_ar ?? '',
    titleEn: initial?.title_en ?? '',
    descriptionAr: initial?.description_ar ?? '',
    descriptionEn: initial?.description_en ?? '',
    categoryId: initial?.category_id ?? '',
    price: initial ? String(initial.price_minor / 100) : '',
    days: String(initial?.estimated_days ?? 3),
    revisions: String(initial?.revisions_included ?? 1),
    deliverables: (initial?.deliverables ?? []).join('\n'),
    requiredDocuments: (initial?.required_documents ?? []).join('\n'),
    revisionPolicy: initial?.revision_policy ?? '',
    refundTerms: initial?.refund_terms ?? '',
  })
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const submit = (forReview: boolean) =>
    start(async () => {
      const res = await saveService({
        id: initial?.id,
        slug: f.slug,
        titleAr: f.titleAr,
        titleEn: f.titleEn,
        descriptionAr: f.descriptionAr,
        descriptionEn: f.descriptionEn,
        categoryId: f.categoryId || null,
        price: Number(f.price),
        days: Number(f.days),
        revisions: Number(f.revisions),
        deliverables: lines(f.deliverables),
        requiredDocuments: lines(f.requiredDocuments),
        revisionPolicy: f.revisionPolicy,
        refundTerms: f.refundTerms,
        submit: forReview,
      })
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors)
        toast.error(res.detail ?? terr(res.fieldErrors ? 'required' : res.error))
        return
      }
      toast.success(t('saved'))
      setOpen(false)
      router.refresh()
    })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> {tc('edit')}
          </Button>
        ) : (
          <Button variant="gold">
            <Plus aria-hidden /> {t('new')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={initial ? t('edit') : t('new')} description={t('reviewNote')} closeLabel={tc('close')} className="max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="sv-tar" label={t('titleAr')} error={errors.titleAr} required>
            <Input id="sv-tar" value={f.titleAr} onChange={set('titleAr')} />
          </FormField>
          <FormField id="sv-ten" label={t('titleEn')}>
            <Input id="sv-ten" dir="ltr" value={f.titleEn} onChange={set('titleEn')} />
          </FormField>
          <FormField id="sv-slug" label={t('slug')} error={errors.slug} required>
            <Input id="sv-slug" dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="contract-review" />
          </FormField>
          <FormField id="sv-cat" label={t('category')}>
            <NativeSelect id="sv-cat" value={f.categoryId} onChange={set('categoryId')}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="sv-dar" label={t('descriptionAr')} error={errors.descriptionAr} className="sm:col-span-2" required>
            <Textarea id="sv-dar" rows={4} value={f.descriptionAr} onChange={set('descriptionAr')} />
          </FormField>
          <FormField id="sv-den" label={t('descriptionEn')} className="sm:col-span-2">
            <Textarea id="sv-den" dir="ltr" rows={3} value={f.descriptionEn} onChange={set('descriptionEn')} />
          </FormField>
          <FormField id="sv-price" label={t('price')} error={errors.price} required>
            <Input id="sv-price" type="number" min={1} value={f.price} onChange={set('price')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="sv-days" label={t('days')}>
              <Input id="sv-days" type="number" min={1} max={120} value={f.days} onChange={set('days')} />
            </FormField>
            <FormField id="sv-rev" label={t('revisions')}>
              <Input id="sv-rev" type="number" min={0} max={10} value={f.revisions} onChange={set('revisions')} />
            </FormField>
          </div>
          <FormField id="sv-del" label={t('deliverables')}>
            <Textarea id="sv-del" rows={4} value={f.deliverables} onChange={set('deliverables')} />
          </FormField>
          <FormField id="sv-req" label={t('requiredDocuments')}>
            <Textarea id="sv-req" rows={4} value={f.requiredDocuments} onChange={set('requiredDocuments')} />
          </FormField>
          <FormField id="sv-rp" label={t('revisionPolicy')}>
            <Textarea id="sv-rp" rows={2} value={f.revisionPolicy} onChange={set('revisionPolicy')} />
          </FormField>
          <FormField id="sv-rt" label={t('refundTerms')}>
            <Textarea id="sv-rt" rows={2} value={f.refundTerms} onChange={set('refundTerms')} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => submit(false)} disabled={pending}>
            {t('saveDraft')}
          </Button>
          <Button variant="gold" loading={pending} onClick={() => submit(true)}>
            {t('submitForReview')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
