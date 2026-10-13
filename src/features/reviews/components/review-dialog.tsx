'use client'
import { Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/shared/form'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay'
import { useRouter } from '@/i18n/navigation'
import { reviewFlags } from '@/lib/domain/reviews'
import { cn } from '@/lib/utils'
import { submitReview } from '../actions'

export function ReviewDialog({
  open,
  onOpenChange,
  appointmentId,
  serviceOrderId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointmentId?: string
  serviceOrderId?: string
}) {
  const t = useTranslations('dashboard.reviews')
  const tc = useTranslations('common')
  const te = useTranslations('errors')
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [pending, start] = useTransition()
  const flagged = reviewFlags(comment).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('write')} closeLabel={tc('close')}>
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-semibold">{t('rating')}</legend>
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                className="cursor-pointer rounded p-0.5"
                aria-label={t('stars', { count: i })}
                aria-pressed={rating === i}
              >
                <Star className={cn('size-8 transition-colors', i <= (hover || rating) ? 'fill-gold text-gold' : 'text-muted-foreground/40')} />
              </button>
            ))}
          </div>
        </fieldset>
        <FormField id="comment" label={t('comment')} hint={t('commentHint')}>
          <Textarea id="comment" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        {flagged ? <p className="mt-2 text-xs text-warning">{t('pendingModeration')}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant="gold"
            disabled={rating === 0}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await submitReview({ appointmentId, serviceOrderId, rating, comment })
                if (!res.ok) return void toast.error(res.detail ?? te(res.error))
                toast.success(res.data.status === 'published' ? t('submitted') : t('pendingModeration'))
                onOpenChange(false)
                router.refresh()
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
