import { Star } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { EmptyState, PageHeader, RatingStars, StatusBadge } from '@/components/shared'
import { ReviewResponse } from '@/features/reviews/components/review-response'
import { requirePortal } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function LawyerReviewsPage() {
  const ctx = await requirePortal('lawyer')
  const t = await getTranslations('dashboard.reviews')
  const te = await getTranslations('enums.review')
  const tl = await getTranslations('lawyers.profile')
  const locale = await getLocale()
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, comment, status, display_name, lawyer_response, created_at')
    .eq('lawyer_id', ctx.userId)
    .order('created_at', { ascending: false })
  return (
    <>
      <PageHeader title={t('title')} description={t('lawyerSubtitle')} />
      {data?.length ? (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RatingStars value={r.rating} />
                  <span className="text-sm font-semibold">{r.display_name ?? tl('anonymousClient')}</span>
                  <StatusBadge status={r.status} label={te(r.status)} />
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(r.created_at, locale)}</span>
              </div>
              {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
              {r.lawyer_response ? <p className="mt-2 rounded-lg border-s-2 border-gold bg-muted/60 p-2 text-sm">{r.lawyer_response}</p> : null}
              <div className="mt-3">
                <ReviewResponse reviewId={r.id} existing={r.lawyer_response} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Star} title={t('empty')} />
      )}
    </>
  )
}
