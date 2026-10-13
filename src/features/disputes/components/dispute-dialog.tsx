'use client'
import { Paperclip, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { ACCEPT_ATTR, isAllowedFile } from '@/lib/files'
import { uploadDocument } from '@/features/documents/upload-client'
import { openDispute } from '../actions'

const REASONS = ['quality', 'no_show', 'billing', 'misconduct', 'refund_request', 'other'] as const

export function DisputeDialog({ open, onOpenChange, appointmentId, serviceOrderId }: { open: boolean; onOpenChange: (o: boolean) => void; appointmentId?: string; serviceOrderId?: string }) {
  const t = useTranslations('dashboard.disputes')
  const te = useTranslations('enums.disputeReason')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [reason, setReason] = useState<(typeof REASONS)[number]>('quality')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pending, start] = useTransition()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('openTitle')} closeLabel={tc('close')}>
        <div className="space-y-4">
          <FormField id="d-reason" label={t('reason')}>
            <NativeSelect id="d-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {te(r)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="d-desc" label={t('description')} hint={t('descriptionHint')} error={description && description.trim().length < 20 ? 'tooShort' : undefined}>
            <Textarea id="d-desc" rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField id="d-files" label={t('evidence')} hint={t('evidenceHint')}>
            <Input
              id="d-files"
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="h-auto py-2"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).filter(isAllowedFile)
                setFiles((f) => [...f, ...picked].slice(0, 5))
                e.target.value = ''
              }}
            />
          </FormField>
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2 truncate">
                <Paperclip className="size-4 text-gold" aria-hidden /> {f.name}
              </span>
              <button type="button" className="cursor-pointer" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={tc('remove')}>
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            disabled={description.trim().length < 20}
            onClick={() =>
              start(async () => {
                const evidenceIds: string[] = []
                for (const f of files) {
                  const up = await uploadDocument(f, { category: 'evidence', appointmentId, serviceOrderId })
                  if (up.ok) evidenceIds.push(up.documentId)
                  else toast.error(`${f.name}: ${terr(up.error)}`)
                }
                const res = await openDispute({ appointmentId, serviceOrderId, reason, description, evidenceIds })
                if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
                toast.success(t('opened'))
                onOpenChange(false)
                router.push(`/disputes/${res.data.id}`)
              })
            }
          >
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
