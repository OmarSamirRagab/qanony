'use client'
import { Flag, Reply } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { reportReview, respondToReview } from '../actions'

export function ReviewResponse({ reviewId, existing }: { reviewId: string; existing: string | null }) {
  const t = useTranslations('dashboard.reviews')
  const tr = useTranslations('enums.reportReason')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const router = useRouter()
  const [dialog, setDialog] = useState<'respond' | 'report' | null>(null)
  const [text, setText] = useState(existing ?? '')
  const [reason, setReason] = useState<'confidential_info' | 'offensive' | 'fake' | 'spam' | 'other'>('confidential_info')
  const [details, setDetails] = useState('')
  const [pending, start] = useTransition()
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setDialog('respond')}>
        <Reply aria-hidden /> {t('respond')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDialog('report')}>
        <Flag aria-hidden /> {t('report')}
      </Button>
      <Dialog open={dialog === 'respond'} onOpenChange={(o) => setDialog(o ? 'respond' : null)}>
        <DialogContent title={t('respond')} description={t('lawyerSubtitle')} closeLabel={tc('close')}>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('response')} maxLength={2000} />
          <DialogFooter>
            <Button
              loading={pending}
              disabled={text.trim().length < 2}
              onClick={() =>
                start(async () => {
                  const res = await respondToReview(reviewId, text)
                  if (!res.ok) return void toast.error(te(res.error))
                  toast.success(t('responseSaved'))
                  setDialog(null)
                  router.refresh()
                })
              }
            >
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'report'} onOpenChange={(o) => setDialog(o ? 'report' : null)}>
        <DialogContent title={t('report')} closeLabel={tc('close')}>
          <div className="space-y-3">
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value as 'other')} aria-label={t('reportReason')}>
              {(['confidential_info', 'offensive', 'fake', 'spam', 'other'] as const).map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </NativeSelect>
            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('reportDetails')} aria-label={t('reportDetails')} />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await reportReview(reviewId, reason, details)
                  if (!res.ok) return void toast.error(te(res.error))
                  toast.success(t('reported'))
                  setDialog(null)
                  router.refresh()
                })
              }
            >
              {tc('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
