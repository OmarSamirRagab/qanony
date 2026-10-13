'use client'
import { Eye, EyeOff, MoreVertical, Sparkles, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { setDocumentShared } from '@/features/matters/actions'
import { deleteDocument, setDocumentAiAllowed } from '../actions'

export function DocumentRowActions({
  documentId,
  isOwner,
  matterId,
  shared,
  canShareWithClient,
  aiAllowed,
}: {
  documentId: string
  isOwner: boolean
  matterId?: string
  shared?: boolean
  canShareWithClient?: boolean
  aiAllowed?: boolean
}) {
  const ta = useTranslations('ai.tools')
  const t = useTranslations('dashboard.documents')
  const tm = useTranslations('matters.documents')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  if (!isOwner && !(matterId && canShareWithClient)) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={tc('actions')}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {matterId && canShareWithClient ? (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await setDocumentShared(matterId, documentId, !shared)
                  if (!res.ok) toast.error(terr(res.error))
                  router.refresh()
                })
              }
            >
              {shared ? <EyeOff /> : <Eye />} {shared ? tm('notShared') : tm('shareWithClient')}
            </DropdownMenuItem>
          ) : null}
          {isOwner ? (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await setDocumentAiAllowed(documentId, !aiAllowed)
                  if (!res.ok) toast.error(terr(res.error))
                  router.refresh()
                })
              }
            >
              <Sparkles /> {aiAllowed ? ta('disallowAi') : ta('allowAi')}
            </DropdownMenuItem>
          ) : null}
          {isOwner ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
              <Trash2 /> {tc('delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={tc('confirmDeleteTitle')} description={t('deleteConfirm')} closeLabel={tc('close')}>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteDocument(documentId)
                  if (!res.ok) return void toast.error(terr(res.error))
                  toast.success(t('deleted'))
                  setConfirm(false)
                  router.refresh()
                })
              }
            >
              {tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
