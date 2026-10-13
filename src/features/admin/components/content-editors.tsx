'use client'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Notice } from '@/components/shared/notices-client'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { Label, Switch } from '@/components/ui/primitives'
import { useRouter } from '@/i18n/navigation'
import type { ActionResult } from '@/lib/action'
import { deleteFaq, saveArticle, saveCategory, saveCmsPage, saveFaq } from '../actions'

const STATUSES = ['draft', 'published', 'archived'] as const
type Status = (typeof STATUSES)[number]

function useSubmit(onDone: () => void) {
  const terr = useTranslations('errors')
  const t = useTranslations('admin.content')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        return void toast.error(res.detail ?? terr(res.fieldErrors ? 'required' : res.error))
      }
      setErrors({})
      toast.success(t('saved'))
      onDone()
      router.refresh()
    })
  return { pending, errors, run }
}

function StatusSelect({ id, value, onChange }: { id: string; value: Status; onChange: (s: Status) => void }) {
  const t = useTranslations('admin.content')
  const te = useTranslations('enums.contentStatus')
  return (
    <FormField id={id} label={t('status')}>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as Status)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {te(s)}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  )
}

function TriggerButton({ edit, ...props }: { edit: boolean } & React.ComponentProps<typeof Button>) {
  const t = useTranslations('admin.content')
  const tc = useTranslations('common')
  return edit ? (
    <Button variant="ghost" size="icon-sm" aria-label={tc('edit')} {...props}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="gold" size="sm" {...props}>
      <Plus /> {t('new')}
    </Button>
  )
}

// ---------------------------------------------------------------------------
export interface ArticleInitial {
  id: string
  slug: string
  kind: string
  category_id: string | null
  title_ar: string
  title_en: string | null
  excerpt_ar: string | null
  excerpt_en: string | null
  body_ar: string
  body_en: string | null
  sources: string[]
  reviewed_by_lawyer: boolean
  status: Status
}

export function ArticleDialog({ initial, categories }: { initial?: ArticleInitial; categories: { id: string; name: string }[] }) {
  const t = useTranslations('admin.content')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    slug: initial?.slug ?? '',
    kind: (initial?.kind ?? 'article') as 'article' | 'guide',
    categoryId: initial?.category_id ?? '',
    titleAr: initial?.title_ar ?? '',
    titleEn: initial?.title_en ?? '',
    excerptAr: initial?.excerpt_ar ?? '',
    excerptEn: initial?.excerpt_en ?? '',
    bodyAr: initial?.body_ar ?? '',
    bodyEn: initial?.body_en ?? '',
    sources: (initial?.sources ?? []).join('\n'),
    reviewed: initial?.reviewed_by_lawyer ?? false,
    status: initial?.status ?? ('draft' as Status),
  })
  const { pending, errors, run } = useSubmit(() => setOpen(false))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const id = (s: string) => `ar-${initial?.id ?? 'new'}-${s}`
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TriggerButton edit={Boolean(initial)} />
      </DialogTrigger>
      <DialogContent title={initial ? initial.title_ar : t('new')} className="max-w-3xl" closeLabel={tc('close')}>
        <Notice tone="warning" title={t('contentWarning')} className="mb-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id('slug')} label={t('slug')} required error={errors.slug}>
            <Input id={id('slug')} dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </FormField>
          <FormField id={id('kind')} label={t('kind')}>
            <NativeSelect id={id('kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'article' | 'guide' })}>
              <option value="article">{t('kinds.article')}</option>
              <option value="guide">{t('kinds.guide')}</option>
            </NativeSelect>
          </FormField>
          <FormField id={id('cat')} label={tc('category')}>
            <NativeSelect id={id('cat')} value={f.categoryId} onChange={set('categoryId')}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <StatusSelect id={id('status')} value={f.status} onChange={(s) => setF({ ...f, status: s })} />
          <FormField id={id('tar')} label={t('titleAr')} required error={errors.titleAr}>
            <Input id={id('tar')} value={f.titleAr} onChange={set('titleAr')} />
          </FormField>
          <FormField id={id('ten')} label={t('titleEn')}>
            <Input id={id('ten')} dir="ltr" value={f.titleEn} onChange={set('titleEn')} />
          </FormField>
          <FormField id={id('ear')} label={t('excerptAr')}>
            <Textarea id={id('ear')} rows={2} value={f.excerptAr} onChange={set('excerptAr')} />
          </FormField>
          <FormField id={id('een')} label={t('excerptEn')}>
            <Textarea id={id('een')} rows={2} dir="ltr" value={f.excerptEn} onChange={set('excerptEn')} />
          </FormField>
          <FormField id={id('bar')} label={t('bodyAr')} required error={errors.bodyAr} className="sm:col-span-2">
            <Textarea id={id('bar')} rows={10} value={f.bodyAr} onChange={set('bodyAr')} />
          </FormField>
          <FormField id={id('ben')} label={t('bodyEn')} className="sm:col-span-2">
            <Textarea id={id('ben')} rows={6} dir="ltr" value={f.bodyEn} onChange={set('bodyEn')} />
          </FormField>
          <FormField id={id('src')} label={t('sources')} className="sm:col-span-2">
            <Textarea id={id('src')} rows={3} value={f.sources} onChange={set('sources')} />
          </FormField>
          <div className="flex items-center gap-3">
            <Switch id={id('rev')} checked={f.reviewed} onCheckedChange={(v) => setF({ ...f, reviewed: v })} />
            <Label htmlFor={id('rev')}>{t('reviewed')}</Label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button
            loading={pending}
            onClick={() =>
              run(() =>
                saveArticle({
                  id: initial?.id,
                  slug: f.slug,
                  kind: f.kind,
                  categoryId: f.categoryId || null,
                  titleAr: f.titleAr,
                  titleEn: f.titleEn,
                  excerptAr: f.excerptAr,
                  excerptEn: f.excerptEn,
                  bodyAr: f.bodyAr,
                  bodyEn: f.bodyEn,
                  sources: f.sources.split('\n').map((s) => s.trim()).filter(Boolean),
                  reviewedByLawyer: f.reviewed,
                  status: f.status,
                }),
              )
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
export interface FaqInitial {
  id: string
  audience: string
  question_ar: string
  question_en: string | null
  answer_ar: string
  answer_en: string | null
  sort_order: number
  is_published: boolean
}

const AUDIENCES = ['general', 'client', 'lawyer', 'firm'] as const

export function FaqDialog({ initial }: { initial?: FaqInitial }) {
  const t = useTranslations('admin.content')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    audience: (initial?.audience ?? 'general') as (typeof AUDIENCES)[number],
    questionAr: initial?.question_ar ?? '',
    questionEn: initial?.question_en ?? '',
    answerAr: initial?.answer_ar ?? '',
    answerEn: initial?.answer_en ?? '',
    order: String(initial?.sort_order ?? 0),
    published: initial?.is_published ?? true,
  })
  const { pending, errors, run } = useSubmit(() => setOpen(false))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const id = (s: string) => `fq-${initial?.id ?? 'new'}-${s}`
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TriggerButton edit={Boolean(initial)} />
      </DialogTrigger>
      <DialogContent title={initial ? initial.question_ar : t('new')} className="max-w-2xl" closeLabel={tc('close')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id('aud')} label={t('audience')}>
            <NativeSelect id={id('aud')} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as (typeof AUDIENCES)[number] })}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {t(`audiences.${a}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id={id('ord')} label={t('order')}>
            <Input id={id('ord')} type="number" min={0} dir="ltr" value={f.order} onChange={set('order')} />
          </FormField>
          <FormField id={id('qar')} label={`${t('question')} (AR)`} required error={errors.questionAr} className="sm:col-span-2">
            <Input id={id('qar')} value={f.questionAr} onChange={set('questionAr')} />
          </FormField>
          <FormField id={id('aar')} label={`${t('answer')} (AR)`} required error={errors.answerAr} className="sm:col-span-2">
            <Textarea id={id('aar')} rows={4} value={f.answerAr} onChange={set('answerAr')} />
          </FormField>
          <FormField id={id('qen')} label={`${t('question')} (EN)`} className="sm:col-span-2">
            <Input id={id('qen')} dir="ltr" value={f.questionEn} onChange={set('questionEn')} />
          </FormField>
          <FormField id={id('aen')} label={`${t('answer')} (EN)`} className="sm:col-span-2">
            <Textarea id={id('aen')} rows={4} dir="ltr" value={f.answerEn} onChange={set('answerEn')} />
          </FormField>
          <div className="flex items-center gap-3">
            <Switch id={id('pub')} checked={f.published} onCheckedChange={(v) => setF({ ...f, published: v })} />
            <Label htmlFor={id('pub')}>{t('published')}</Label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button
            loading={pending}
            onClick={() =>
              run(() =>
                saveFaq({
                  id: initial?.id,
                  audience: f.audience,
                  questionAr: f.questionAr,
                  questionEn: f.questionEn,
                  answerAr: f.answerAr,
                  answerEn: f.answerEn,
                  sortOrder: Number(f.order) || 0,
                  isPublished: f.published,
                }),
              )
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteFaqButton({ id }: { id: string }) {
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  if (!confirming)
    return (
      <Button variant="ghost" size="icon-sm" aria-label={tc('delete')} onClick={() => setConfirming(true)}>
        <Trash2 />
      </Button>
    )
  return (
    <span className="inline-flex gap-1">
      <Button
        variant="destructive"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteFaq(id)
            if (!res.ok) toast.error(terr(res.error))
            router.refresh()
          })
        }
      >
        {tc('confirm')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {tc('cancel')}
      </Button>
    </span>
  )
}

// ---------------------------------------------------------------------------
export interface PageInitial {
  slug: 'privacy' | 'terms' | 'refund-policy' | 'about'
  title_ar: string
  title_en: string | null
  body_ar: string
  body_en: string | null
  status: Status
}

export function CmsPageEditor({ initial }: { initial: PageInitial }) {
  const t = useTranslations('admin.content')
  const tc = useTranslations('common')
  const [f, setF] = useState({
    titleAr: initial.title_ar,
    titleEn: initial.title_en ?? '',
    bodyAr: initial.body_ar,
    bodyEn: initial.body_en ?? '',
    status: initial.status,
  })
  const { pending, errors, run } = useSubmit(() => {})
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const id = (s: string) => `pg-${initial.slug}-${s}`
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={id('tar')} label={t('titleAr')} required error={errors.titleAr}>
        <Input id={id('tar')} value={f.titleAr} onChange={set('titleAr')} />
      </FormField>
      <FormField id={id('ten')} label={t('titleEn')}>
        <Input id={id('ten')} dir="ltr" value={f.titleEn} onChange={set('titleEn')} />
      </FormField>
      <FormField id={id('bar')} label={t('bodyAr')} required error={errors.bodyAr} className="sm:col-span-2">
        <Textarea id={id('bar')} rows={12} value={f.bodyAr} onChange={set('bodyAr')} />
      </FormField>
      <FormField id={id('ben')} label={t('bodyEn')} className="sm:col-span-2">
        <Textarea id={id('ben')} rows={8} dir="ltr" value={f.bodyEn} onChange={set('bodyEn')} />
      </FormField>
      <StatusSelect id={id('st')} value={f.status} onChange={(s) => setF({ ...f, status: s })} />
      <div className="flex items-end">
        <Button
          loading={pending}
          onClick={() => run(() => saveCmsPage({ slug: initial.slug, titleAr: f.titleAr, titleEn: f.titleEn, bodyAr: f.bodyAr, bodyEn: f.bodyEn, status: f.status }))}
        >
          {tc('save')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export interface CategoryInitial {
  id: string
  slug: string
  name_ar: string
  name_en: string
  icon: string | null
  sort_order: number
  is_active: boolean
}

export function CategoryDialog({ initial }: { initial?: CategoryInitial }) {
  const t = useTranslations('admin.categories')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    slug: initial?.slug ?? '',
    nameAr: initial?.name_ar ?? '',
    nameEn: initial?.name_en ?? '',
    icon: initial?.icon ?? '',
    order: String(initial?.sort_order ?? 0),
    active: initial?.is_active ?? true,
  })
  const { pending, errors, run } = useSubmit(() => setOpen(false))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const id = (s: string) => `ct-${initial?.id ?? 'new'}-${s}`
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TriggerButton edit={Boolean(initial)} />
      </DialogTrigger>
      <DialogContent title={initial ? initial.name_ar : t('add')} closeLabel={tc('close')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id('slug')} label={t('slug')} required error={errors.slug}>
            <Input id={id('slug')} dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </FormField>
          <FormField id={id('icon')} label={t('icon')}>
            <Input id={id('icon')} dir="ltr" value={f.icon} onChange={set('icon')} placeholder="scale" />
          </FormField>
          <FormField id={id('ar')} label={t('nameAr')} required error={errors.nameAr}>
            <Input id={id('ar')} value={f.nameAr} onChange={set('nameAr')} />
          </FormField>
          <FormField id={id('en')} label={t('nameEn')} required error={errors.nameEn}>
            <Input id={id('en')} dir="ltr" value={f.nameEn} onChange={set('nameEn')} />
          </FormField>
          <FormField id={id('ord')} label={t('order')}>
            <Input id={id('ord')} type="number" min={0} dir="ltr" value={f.order} onChange={set('order')} />
          </FormField>
          <div className="flex items-end gap-3 pb-2">
            <Switch id={id('act')} checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
            <Label htmlFor={id('act')}>{t('active')}</Label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button
            loading={pending}
            onClick={() =>
              run(() => saveCategory({ id: initial?.id, slug: f.slug, nameAr: f.nameAr, nameEn: f.nameEn, icon: f.icon, sortOrder: Number(f.order) || 0, isActive: f.active }))
            }
          >
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
