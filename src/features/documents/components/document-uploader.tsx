'use client'
import { Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { ACCEPT_ATTR, formatBytes, isAllowedFile } from '@/lib/files'
import type { Enums } from '@/types/database'
import { uploadDocument, type UploadTarget } from '../upload-client'

const CATEGORIES: Enums<'document_category'>[] = [
  'contract',
  'identity',
  'legal_notice',
  'case_document',
  'court_submission',
  'evidence',
  'legal_opinion',
  'agreement',
  'invoice',
  'power_of_attorney',
  'deliverable',
  'other',
]

export function DocumentUploader({
  target,
  label,
  defaultCategory = 'case_document',
  allowShareWithClient = false,
  variant = 'outline',
  onUploaded,
}: {
  target: Omit<UploadTarget, 'category' | 'title'>
  label?: string
  defaultCategory?: Enums<'document_category'>
  allowShareWithClient?: boolean
  variant?: 'outline' | 'default' | 'gold'
  onUploaded?: (documentId: string) => void
}) {
  const t = useTranslations('dashboard.documents')
  const te = useTranslations('enums.documentCategory')
  const tm = useTranslations('matters.documents')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [share, setShare] = useState(false)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <Upload aria-hidden /> {label ?? t('upload')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('uploadTitle')} closeLabel={tc('close')}>
        <div className="space-y-4">
          <FormField id="doc-file" label={t('file')} hint={terr('invalidFile')}>
            <Input
              ref={inputRef}
              id="doc-file"
              type="file"
              accept={ACCEPT_ATTR}
              className="h-auto py-2"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                if (f && !isAllowedFile(f)) {
                  toast.error(terr('invalidFile'))
                  e.target.value = ''
                  return
                }
                setFile(f)
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
              }}
            />
          </FormField>
          {file ? <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p> : null}
          <FormField id="doc-title" label={t('titleField')}>
            <Input id="doc-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField id="doc-cat" label={t('category')}>
            <NativeSelect id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value as Enums<'document_category'>)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {te(c)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {allowShareWithClient ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={share} onCheckedChange={(v) => setShare(v === true)} /> {tm('shareWithClient')}
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            disabled={!file}
            loading={pending}
            onClick={() =>
              file &&
              start(async () => {
                const res = await uploadDocument(file, { ...target, category, title: title || file.name, shareWithClient: share })
                if (!res.ok) return void toast.error(terr(res.error))
                toast.success(t('uploaded'))
                setOpen(false)
                setFile(null)
                setTitle('')
                onUploaded?.(res.documentId)
                router.refresh()
              })
            }
          >
            {pending ? t('uploading') : tc('upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
