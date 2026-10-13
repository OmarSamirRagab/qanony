'use client'
import { Gavel, MessagesSquare, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay'
import { Link, useRouter } from '@/i18n/navigation'
import type { Enums } from '@/types/database'
import { DisputeDialog } from '@/features/disputes/components/dispute-dialog'
import { ReviewDialog } from '@/features/reviews/components/review-dialog'
import { transitionServiceOrder } from '../actions'

type Status = Enums<'service_order_status'>

export function OrderActions({
  id,
  viewer,
  status,
  revisionsUsed,
  revisionsAllowed,
  conversationId,
  hasReview,
  hasOpenDispute,
}: {
  id: string
  viewer: 'client' | 'lawyer'
  status: Status
  revisionsUsed: number
  revisionsAllowed: number
  conversationId: string | null
  hasReview: boolean
  hasOpenDispute: boolean
}) {
  const t = useTranslations('dashboard.orders')
  const te = useTranslations('enums.serviceOrderAction')
  const tc = useTranslations('common')
  const terr = useTranslations('errors')
  const tr = useTranslations('dashboard.reviews')
  const td = useTranslations('dashboard.disputes')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<Status | null>(null)
  const [note, setNote] = useState('')
  const [dialog, setDialog] = useState<'review' | 'dispute' | null>(null)

  const actions: Status[] = []
  if (viewer === 'lawyer') {
    if (['PAID', 'WAITING_FOR_CLIENT', 'REVISION_REQUESTED'].includes(status)) actions.push('IN_PROGRESS')
    if (status === 'IN_PROGRESS') actions.push('WAITING_FOR_CLIENT', 'DELIVERED')
    if (status === 'REVISION_REQUESTED') actions.push('DELIVERED')
    if (['PAID', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'].includes(status)) actions.push('CANCELLED')
  } else {
    if (status === 'DELIVERED') {
      actions.push('COMPLETED')
      if (revisionsUsed < revisionsAllowed) actions.push('REVISION_REQUESTED')
    }
    if (status === 'WAITING_FOR_CLIENT') actions.push('IN_PROGRESS')
    if (['CREATED', 'PENDING_PAYMENT', 'PAID'].includes(status)) actions.push('CANCELLED')
  }
  const needsNote = (s: Status) => s === 'CANCELLED' || s === 'REVISION_REQUESTED' || s === 'WAITING_FOR_CLIENT'

  const go = (to: Status, n?: string) =>
    start(async () => {
      const res = await transitionServiceOrder(id, to, n)
      if (!res.ok) return void toast.error(res.detail ?? terr(res.error))
      toast.success(t('updated'))
      setTarget(null)
      setNote('')
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-2">
      {viewer === 'client' && status === 'PENDING_PAYMENT' ? (
        <Button asChild variant="gold" size="lg">
          <Link href={`/checkout/service_order/${id}`}>{t('pay')}</Link>
        </Button>
      ) : null}
      {actions.map((a) => (
        <Button key={a} variant={a === 'CANCELLED' ? 'ghost' : a === 'COMPLETED' || a === 'DELIVERED' ? 'gold' : 'outline'} className={a === 'CANCELLED' ? 'text-destructive' : ''} loading={pending && target === a} onClick={() => (needsNote(a) ? setTarget(a) : go(a))}>
          {te(a as 'COMPLETED')}
        </Button>
      ))}
      {conversationId ? (
        <Button asChild variant="outline">
          <Link href={`/${viewer}/messages/${conversationId}`}>
            <MessagesSquare aria-hidden /> {t('openChat')}
          </Link>
        </Button>
      ) : null}
      {viewer === 'client' && status === 'COMPLETED' && !hasReview ? (
        <Button variant="gold" onClick={() => setDialog('review')}>
          <Star aria-hidden /> {tr('write')}
        </Button>
      ) : null}
      {!hasOpenDispute && ['PAID', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED', 'COMPLETED'].includes(status) ? (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setDialog('dispute')}>
          <Gavel aria-hidden /> {td('open')}
        </Button>
      ) : null}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title={target ? te(target as 'COMPLETED') : ''} closeLabel={tc('close')}>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} aria-label={t('note')} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              {tc('back')}
            </Button>
            <Button loading={pending} disabled={target === 'CANCELLED' && viewer === 'lawyer' && note.trim().length < 3} onClick={() => target && go(target, note)}>
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {viewer === 'client' ? <ReviewDialog open={dialog === 'review'} onOpenChange={(o) => setDialog(o ? 'review' : null)} serviceOrderId={id} /> : null}
      <DisputeDialog open={dialog === 'dispute'} onOpenChange={(o) => setDialog(o ? 'dispute' : null)} serviceOrderId={id} />
    </div>
  )
}
